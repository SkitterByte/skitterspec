  //
  // THIS DISTRIBUTION SEEDS BOTH KEYS. `skitterspec init --isolation` writes an
  // `env.config.json` already carrying
  // `"companionPaths": ["specs/.core/github-base/{identifier}.base.json"]` and
  // `"identifierField": "github_identifier"`, because the GitHub snapshot is
  // written by this package, and only this package knows where. What follows is
  // the base engine's default — what you get if you clear them.
  //
  // Both or neither: `{identifier}` resolves through `branch.identifierField`,
  // so `companionPaths` on its own expands to nothing and owns nothing.
