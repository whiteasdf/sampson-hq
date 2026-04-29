import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "dev only" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1 });
  const user = users?.[0];
  if (!user) return Response.json({ error: "no users" }, { status: 500 });

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: user.email!,
  });

  if (error || !data.properties?.hashed_token) {
    return Response.json({ error: error?.message ?? "no token" }, { status: 500 });
  }

  const verifyUrl = `${process.env.SUPABASE_URL}/auth/v1/verify?token=${data.properties.hashed_token}&type=magiclink`;
  const verifyRes = await fetch(verifyUrl, { redirect: "manual" });
  const location = verifyRes.headers.get("location") ?? "";

  const hashParams = new URLSearchParams(location.split("#")[1] ?? "");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return Response.json({ error: "no tokens in redirect", location }, { status: 500 });
  }

  const cookieName = `sb-pyvuxxqblfwjjnhjshby-auth-token`;
  const cookieValue = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  const chunks = [];
  const chunkSize = 3500;
  for (let i = 0; i < cookieValue.length; i += chunkSize) {
    chunks.push(cookieValue.slice(i, i + chunkSize));
  }

  const response = NextResponse.redirect(new URL("/", "http://localhost:3000"));
  chunks.forEach((chunk, i) => {
    response.cookies.set(`${cookieName}.${i}`, chunk, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 3600,
    });
  });

  return response;
}
