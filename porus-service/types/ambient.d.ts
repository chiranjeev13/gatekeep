declare module "x402-express" {
  import { RequestHandler } from "express";

  export interface ProtectedRouteConfigItem {
    price: string;
    network: string;
    config?: Record<string, unknown>;
  }

  export type ProtectedRoutes = Record<string, ProtectedRouteConfigItem>;

  export function paymentMiddleware(
    walletAddress: string,
    protectedRoutes: ProtectedRoutes,
    facilitatorConfig: unknown
  ): RequestHandler;
}

declare module "@coinbase/x402" {
  export interface FacilitatorConfig {
    apiKey: string;
    apiSecret: string;
    [key: string]: unknown;
  }

  export function createFacilitatorConfig(
    apiKey: string,
    apiSecret: string
  ): FacilitatorConfig;
}

// Extend Express Request and Response interfaces
declare global {
  namespace Express {
    interface Request {
      user?: any;
      isAuthenticated?: boolean;
      body?: any;
      path?: string;
    }

    interface Response {
      status?: (code: number) => Response;
      json?: (obj: any) => Response;
      cookie?: (name: string, value: string, options?: any) => Response;
      clearCookie?: (name: string) => Response;
    }

    interface NextFunction {
      (err?: any): void;
    }
  }
}
