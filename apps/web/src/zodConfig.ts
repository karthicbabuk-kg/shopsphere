import { z } from 'zod';

// Imported first from main.tsx so it runs before any schema is created.
// Zod would otherwise probe for eval() to compile faster validators. Our CSP forbids eval (by design),
// so switch that off up front: no CSP violation, same behaviour.
z.config({ jitless: true });
