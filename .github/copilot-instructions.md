This application will be used to batch calls to a service that is failing for really large organizations that have a lot of GitHub repositories. Specifically, we are trying to use the gh repo-stats tool available at https://github.com/mona-actions/gh-repo-stats to help audit repositories that exist for a GitHub organization.

The application will also leverage octokit for making calls to GitHub APIs.

We work in TypeScript and the approach we are implementing should try to leverage constructs such as Queues, Batches, Retry, etc. so take this into consideration when providing responses.

We always use Prettier to format our code.

We will use Jest for our unit tests.

We will use winston as a Logger and have a createLogger function that exists to create an instance of this.
