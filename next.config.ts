import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @google/generative-ai をサーバーサイドのみで使用（バンドル対象外）
  serverExternalPackages: ['@google/generative-ai'],
};

export default nextConfig;
