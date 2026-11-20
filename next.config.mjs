const nextConfig = {
  reactStrictMode: true,
  webpack(config) {
    // libheif's prebuilt bundle probes for `require` in a way webpack cannot analyse. It is harmless in the
    // browser (the WASM is inlined), so keep builds and the dev console free of that one known warning.
    config.ignoreWarnings = [...(config.ignoreWarnings ?? []), { module: /libheif-bundle\.js$/, message: /Critical dependency/ }];
    return config;
  },
};
export default nextConfig;
