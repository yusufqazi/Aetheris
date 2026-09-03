/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["@napi-rs/canvas"],
};

module.exports = nextConfig;
