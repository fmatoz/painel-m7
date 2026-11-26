// Inputs are responses from server-side Supabase HTTP nodes, never browser claims.
export function authorizeUtm7(sessionResponse, profileResponse, payload = {}) {
  const unwrap = (response) => {
    if (!response || typeof response !== "object") return null;
    if ("statusCode" in response) {
      if (response.statusCode !== 200) return null;
      return response.body;
    }
    return response;
  };
  const session = unwrap(sessionResponse);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userId =
    typeof session?.id === "string" && uuid.test(session.id) && !session.error
      ? session.id.toLowerCase()
      : "";
  const profiles = unwrap(profileResponse);
  const profile = Array.isArray(profiles) && profiles.length === 1 ? profiles[0] : null;
  const authorized =
    Boolean(userId) &&
    profile?.user_id?.toLowerCase?.() === userId &&
    profile.active === true &&
    profile.is_admin === true;
  return { user_id: userId, authorized, payload };
}
