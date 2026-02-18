// Code snippet generators for API Playground

import { EndpointDef } from './types';

export const generateCurl = (endpoint: EndpointDef, fullUrl: string, headers: Record<string, string>, body: string) => {
    let cmd = `curl -X ${endpoint.method} "${fullUrl}"`;
    Object.entries(headers).forEach(([k, v]) => {
        if (v) cmd += ` \\\n  -H "${k}: ${v}"`;
    });
    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && body) {
        cmd += ` \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
    }
    return cmd;
};

export const generateFetch = (endpoint: EndpointDef, fullUrl: string, headers: Record<string, string>, body: string) => {
    const opts: string[] = [`  method: "${endpoint.method}"`];
    const headerEntries = Object.entries(headers).filter(([, v]) => v);
    if (headerEntries.length) {
        opts.push(`  headers: {\n    ${headerEntries.map(([k, v]) => `"${k}": "${v}"`).join(',\n    ')}\n  }`);
    }
    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && body) {
        opts.push(`  body: JSON.stringify(${body})`);
    }
    return `fetch("${fullUrl}", {\n${opts.join(',\n')}\n})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));`;
};

export const generateTypeScript = (endpoint: EndpointDef, fullUrl: string, headers: Record<string, string>, body: string) => {
    const fnName = endpoint.id.replace(/-/g, '_');
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method) && body;

    return `interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function ${fnName}(): Promise<ApiResponse> {
  const response = await fetch("${fullUrl}", {
    method: "${endpoint.method}",
    headers: {
      ${Object.entries(headers).filter(([, v]) => v).map(([k, v]) => `"${k}": "${v}"`).join(',\n      ')}
    }${hasBody ? `,\n    body: JSON.stringify(${body})` : ''}
  });

  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}\`);
  }

  return response.json();
}`;
};
