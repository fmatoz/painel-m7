export function authorizeOwnUtm7(response, payload = {}) {
  const body = response?.statusCode === 200 ? response.body : null;
  const u = body?.ok === true ? body.data?.user : null;
  const user_id = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
    u?.id || "",
  )
    ? u.id.toLowerCase()
    : "";
  return {
    user_id,
    authorized: Boolean(user_id) && u.active === true && u.is_admin === true,
    payload,
  };
}

