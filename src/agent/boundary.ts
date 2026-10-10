export function createBoundary(
  texts: (string | null)[],
  generate: () => string = () => crypto.randomUUID(),
): string {
  let boundary = generate();
  while (texts.some((text) => text?.includes(boundary))) boundary = generate();
  return boundary;
}
