declare module "@sap/cds" {
  interface HealthResponse {
    json(body: { status: string; mode: string }): void;
  }

  interface BootstrappedApp {
    get(path: string, handler: (req: unknown, res: HealthResponse) => void): void;
  }

  interface Cds {
    on(event: "bootstrap", handler: (app: BootstrappedApp) => void): void;
  }

  const cds: Cds;
  export default cds;
}
