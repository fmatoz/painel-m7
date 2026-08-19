CREATE TABLE public.home_workspaces (
  user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_text TEXT NOT NULL DEFAULT '' CHECK (char_length(focus_text) <= 500),
  priorities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(priorities) = 'array'),
  goals JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(goals) = 'array'),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 20000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.home_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own home workspace"
  ON public.home_workspaces
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
