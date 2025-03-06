import { run } from './main';

run().catch((error) => {
    console.error('An error occurred:', error);
    process.exit(1);
});
