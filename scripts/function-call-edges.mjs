import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const traverse = require('@babel/traverse').default;

/** Resolve a call using actual lexical bindings, never by spelling alone. */
export function extractCallEdges(modules, symbolByNode) {
  const programByFile = new Map();
  const exportsByFile = new Map();
  const calls = [];
  const exportName = n => n.name ?? n.value;
  const moduleFile = (file, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const requested = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    return [requested, requested + '.js', requested + '.mjs'].find(item => modules.has(item));
  };

  // Record only module exports that are explicitly declared or forwarded. Ignore external
  // and ambiguous star exports rather than guessing at the target from another file's names.
  for (const [file, { ast }] of modules) {
    const exports = new Map();
    traverse(ast, { Program(p) {
      programByFile.set(file, p);
      for (const item of p.node.body) {
        if (item.type === 'ExportDefaultDeclaration') {
          const n = item.declaration;
          if (n.type === 'Identifier' || n.id?.name) exports.set('default', {local: n.name || n.id.name});
        } else if (item.type === 'ExportNamedDeclaration') {
          const d = item.declaration;
          if (d?.id?.name) exports.set(d.id.name, {local: d.id.name});
          for (const v of d?.declarations || []) {
            if (v.id.type === 'Identifier') exports.set(v.id.name, {local: v.id.name});
          }
          for (const s of item.specifiers) {
            if (s.type !== 'ExportSpecifier') continue;
            const name = exportName(s.local);
            exports.set(exportName(s.exported), item.source
              ? {module: moduleFile(file, item.source.value), name}
              : {local: name});
          }
        }
      }
      p.stop();
    }});
    exportsByFile.set(file, exports);
  }

  function resolveExport(file, name, seen) {
    const spec = exportsByFile.get(file)?.get(name);
    if (!spec || seen.has(spec)) return null;
    seen.add(spec);
    return spec.local
      ? resolveBinding(file, programByFile.get(file).scope.getBinding(spec.local), seen)
      : resolveExport(spec.module, spec.name, seen);
  }
  function resolveBinding(file, binding, seen) {
    if (!binding?.constant || seen.has(binding)) return null;
    seen.add(binding);
    const p = binding.path;
    if (symbolByNode.has(p.node)) return symbolByNode.get(p.node);
    if (p.isImportSpecifier() || p.isImportDefaultSpecifier()) {
      const name = p.isImportDefaultSpecifier() ? 'default' : exportName(p.node.imported);
      return resolveExport(moduleFile(file, p.parent.source.value), name, seen);
    }
    if (p.isVariableDeclarator() && p.get('id').isIdentifier() && p.get('init').isIdentifier()) {
      return resolveBinding(file, p.scope.getBinding(p.node.init.name), seen);
    }
    return null;
  }

  for (const [file, {ast, code}] of modules) {
    traverse(ast, { 'CallExpression|OptionalCallExpression|NewExpression'(p) {
      // An invocation inside .map(() => ...) belongs to that callback, not to the
      // enclosing named function. Similarly, top-level program calls have no function caller.
      const from = symbolByNode.get(p.getFunctionParent()?.node);
      if (!from) return;
      const callee = p.get('callee');
      let to = null;
      if (callee.isIdentifier()) {
        to = resolveBinding(file, p.scope.getBinding(callee.node.name), new Set());
      } else if (callee.isMemberExpression() && !callee.node.computed && callee.get('object').isIdentifier()) {
        const b = p.scope.getBinding(callee.node.object.name);
        if (b?.path.isImportNamespaceSpecifier()) {
          to = resolveExport(moduleFile(file, b.path.parent.source.value), callee.node.property.name, new Set());
        }
      }
      if (!to) return;
      const {line, column} = p.node.loc.start;
      const parent = p.parentPath;
      const snippet = n => code.slice(n.start, n.end);
      const resultUse = parent.isVariableDeclarator() && parent.node.init === p.node
        ? snippet(parent.node.id) + ' に格納'
        : parent.isAssignmentExpression() && parent.node.right === p.node ? snippet(parent.node.left) + ' に代入'
        : parent.isReturnStatement() ? '呼出元にそのまま返す'
        : parent.isExpressionStatement() ? '返り値は受け取らない'
        : '式の一部として使用';
      calls.push({
        from, to, line, column: column + 1, resultUse,
        arguments: p.node.arguments.map(arg => code.slice(arg.start, arg.end)),
      });
    }});
  }
  return calls;
}
