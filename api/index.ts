import { app } from '../server.js';

// Vercel expects a default export that is a request handler function.
// Wrapping the Express app in a handler ensures compatibility with serverless runtimes.
export default function handler(req, res) {
	return app(req, res);
}
