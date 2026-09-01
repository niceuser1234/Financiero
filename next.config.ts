import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-Actions enthalten bei der FinTS-Anbindung sensible Zugangsdaten.
  // Next.js protokolliert ihre Argumente sonst standardmäßig im Dev-Terminal.
  logging: {
    serverFunctions: false,
  },
};

export default nextConfig;
