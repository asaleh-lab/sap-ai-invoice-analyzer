declare module "@sap/cds" {
  interface HealthResponse {
    json(body: unknown): void;
    redirect(url: string): void;
    status(code: number): HealthResponse;
    type(ext: string): void;
    write(chunk: string | Uint8Array): void;
    end(): void;
  }

  interface BootstrappedApp {
    get(path: string, handler: (req: { path: string }, res: HealthResponse) => void): void;
  }

  interface Cds {
    on(event: "bootstrap", handler: (app: BootstrappedApp) => void): void;
  }

  const cds: Cds;
  export default cds;
}
