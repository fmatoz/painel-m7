CREATE TABLE IF NOT EXISTS public.team_settings (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  announcement_title TEXT NOT NULL DEFAULT '' CHECK (char_length(announcement_title) <= 160),
  announcement_message TEXT NOT NULL DEFAULT '' CHECK (char_length(announcement_message) <= 2000),
  commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 15 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.team_settings (id, commission_rate)
VALUES ('global', 15)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sdr_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_name TEXT NOT NULL CHECK (char_length(seller_name) <= 160),
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 200),
  service TEXT NOT NULL CHECK (char_length(service) BETWEEN 1 AND 120),
  sale_value NUMERIC(12, 2) NOT NULL CHECK (sale_value > 0),
  commission_rate NUMERIC(5, 2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  commission_value NUMERIC(12, 2) GENERATED ALWAYS AS (
    round((sale_value * commission_rate) / 100, 2)
  ) STORED,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdr_sales_seller_id_idx ON public.sdr_sales (seller_id);
CREATE INDEX IF NOT EXISTS sdr_sales_sale_date_idx ON public.sdr_sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS sdr_sales_status_idx ON public.sdr_sales (status);

CREATE OR REPLACE FUNCTION public.prepare_sdr_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_rate NUMERIC(5, 2);
  configured_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT commission_rate INTO configured_rate
  FROM public.team_settings
  WHERE id = 'global';

  SELECT NULLIF(btrim(full_name), '') INTO configured_name
  FROM public.app_users
  WHERE user_id = auth.uid() AND active;

  NEW.seller_id := auth.uid();
  NEW.seller_name := COALESCE(configured_name, 'SDR');
  NEW.commission_rate := COALESCE(configured_rate, 15);
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_sdr_sale_before_insert ON public.sdr_sales;
CREATE TRIGGER prepare_sdr_sale_before_insert
  BEFORE INSERT ON public.sdr_sales
  FOR EACH ROW EXECUTE FUNCTION public.prepare_sdr_sale();

CREATE OR REPLACE FUNCTION public.touch_sdr_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_sdr_sale_before_update ON public.sdr_sales;
CREATE TRIGGER touch_sdr_sale_before_update
  BEFORE UPDATE ON public.sdr_sales
  FOR EACH ROW EXECUTE FUNCTION public.touch_sdr_sale();

ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdr_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inicio members can read team settings"
  ON public.team_settings FOR SELECT TO authenticated
  USING (public.current_user_has_access('inicio'));

CREATE POLICY "Admins can insert team settings"
  ON public.team_settings FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins can update team settings"
  ON public.team_settings FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "SDRs can read own sales and admins can read all"
  ON public.sdr_sales FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.current_user_is_admin());

CREATE POLICY "CRM members can register own sales"
  ON public.sdr_sales FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() AND public.current_user_has_access('crm'));

CREATE POLICY "Admins can review sales"
  ON public.sdr_sales FOR UPDATE TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

CREATE POLICY "SDRs can delete pending own sales and admins can delete all"
  ON public.sdr_sales FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin()
    OR (seller_id = auth.uid() AND status = 'pending')
  );

GRANT SELECT ON public.team_settings TO authenticated;
GRANT INSERT, UPDATE ON public.team_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sdr_sales TO authenticated;
GRANT ALL ON public.team_settings, public.sdr_sales TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_sdr_sale() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_sdr_sale() TO authenticated;

NOTIFY pgrst, 'reload schema';
