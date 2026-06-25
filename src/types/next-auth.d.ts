import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    token: string;
    pubkey: string;
    username: string;
  }

  interface Session {
    token: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      pubkey: string;
      username: string;
      isAdmin: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    token?: string;
    pubkey?: string;
    username?: string;
    isAdmin?: boolean;
  }
}
