/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactCompiler: true,
  experimental: {
    // Don't abort build immediately on prerender failure — collect all failures first.
    // This prevents the _global-error prerender bug from killing the build worker
    // via process.exit(1) before other pages finish generating.
    prerenderEarlyExit: false,
  },
};

export default nextConfig;
