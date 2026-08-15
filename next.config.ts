import type { NextConfig } from 'next';

const config: NextConfig = {
  // sluice is a localhost, single-user, stateless tool: it reads the bank exports
  // and the config off disk on every request and renders. Nothing is cached
  // between runs, because a stale render of a household's money is worse than a
  // slow one.
  reactStrictMode: true,
};

export default config;
