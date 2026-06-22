import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id:      string;
      name:    string;
      email:   string;
      role:    string;
      crmRole: string;
    };
  }
  interface User {
    id:      string;
    role:    string;
    crmRole: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:      string;
    role:    string;
    crmRole: string;
  }
}
