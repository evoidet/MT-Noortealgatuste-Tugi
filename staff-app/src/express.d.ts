declare global {
  interface Error {
    cleanupTarget?: unknown;
    code?: string;
    fields?: unknown;
    issues?: unknown;
    status?: number;
  }

  namespace Express {
    interface Request {
      authSession?: unknown;
      sessionToken?: string;
      user?: {
        id: string;
        email: string;
        name: string;
        role: "member" | "editor" | "finance" | "admin";
      };
    }
  }
}

export {};
