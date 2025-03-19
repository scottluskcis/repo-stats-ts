This application will be used to gather repository statistics for repositories that exist in GitHub. Collection of the results should always try and leverage an approach that is performant, retrieves results incrementally, and provides the ability to retry when failures occur.

Take into consideration the following then providing responses:

- The application will leverage GitHub octokit javascript SDK for making calls to GitHub APIs.
- We work in TypeScript and the approach we are implementing should try to leverage constructs such as Queues, Batches, Retry, etc. when appropriate so take this into consideration when providing responses.
- We always use Prettier to format our code.
- We will use Jest for our unit tests.
- We will use winston as a Logger and have a createLogger function that exists to create an instance of this.
- We use tsx for compiling and running our code and we prefer to have any responses be for a more modern approach.

Code should always be readable and maintainable. Break things down into separate functions and into separate files where it makes sense to do so.
