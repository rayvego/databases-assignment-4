/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-label"],
  },
}

export default nextConfig
