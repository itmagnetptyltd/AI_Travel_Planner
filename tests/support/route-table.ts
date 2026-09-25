export interface RegisteredRoute {
  readonly path: string;
  readonly methods: readonly string[];
}

/**
 * The routes an application has registered, from Fastify's printed route table: a tree in which each line gives one piece of a path
 * and, where a route ends there, its methods. A piece is added to the pieces above it, one level of indentation being four characters.
 */
export function routesOf(printed: string): RegisteredRoute[] {
  const pieces: string[] = [];
  const routes: RegisteredRoute[] = [];
  for (const line of printed.split('\n')) {
    const match = /^([│ ]*)[├└]── (\S+)(?: \(([^)]*)\))?\s*$/.exec(line);
    if (!match) continue;
    const depth = (match[1] ?? '').length / 4;
    pieces.length = depth;
    pieces[depth] = match[2] ?? '';
    if (match[3]) routes.push({ path: pieces.join(''), methods: match[3].split(', ') });
  }
  return routes;
}
