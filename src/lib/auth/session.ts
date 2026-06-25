import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function requireSessionRoute() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return {
      ok: false as const,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    session,
  };
}

export async function requireAdminRoute() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return {
      ok: false as const,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (session.user.isAdmin !== true) {
    return {
      ok: false as const,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    session,
  };
}
