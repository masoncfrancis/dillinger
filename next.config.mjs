/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    // Optimize barrel file imports for better tree-shaking
    // This transforms imports from lucide-react to direct icon imports
    optimizePackageImports: ["lucide-react"],
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  },
};

if (process.env.NEXT_DESKTOP_BUILD === "1") {
  nextConfig.experimental.outputFileTracingExcludes = {
    "*": [
      "node_modules/@sparticuz/chromium/**",
      "node_modules/puppeteer-core/**",
      "node_modules/@puppeteer/**",
    ],
  };
}

export default nextConfig;
