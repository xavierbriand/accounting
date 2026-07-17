export type AgentSpecFrontmatter = {
  name?: string;
  description?: string;
  model?: string;
  tools: string[];
  role?: string;
  specVersion?: number;
};

const FRONTMATTER_FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function parseToolsValue(value: string): string[] {
  return value
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);
}

export function parseAgentSpecFrontmatter(content: string): AgentSpecFrontmatter {
  const result: AgentSpecFrontmatter = { tools: [] };
  const fenceMatch = FRONTMATTER_FENCE.exec(content);
  if (!fenceMatch) {
    return result;
  }

  const region = fenceMatch[1];
  for (const line of region.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    switch (key) {
      case 'name':
        result.name = value;
        break;
      case 'description':
        result.description = value;
        break;
      case 'model':
        result.model = value;
        break;
      case 'role':
        result.role = value;
        break;
      case 'tools':
        result.tools = parseToolsValue(value);
        break;
      case 'spec-version': {
        const parsed = Number(value);
        // Fail-safe: a non-numeric value stays honestly absent rather than
        // being coerced into a fake version — Check F's missing-spec-version
        // finding depends on this distinction (mirrors the role: invalid-vs-
        // absent posture, though spec-version has no "invalid but present"
        // detail — absent is the only signal it needs).
        result.specVersion = Number.isInteger(parsed) ? parsed : undefined;
        break;
      }
      default:
        break;
    }
  }

  return result;
}
