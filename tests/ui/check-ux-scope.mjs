import ts from '../../node_modules/typescript/lib/typescript.js'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const base = '6533b277e9022bf3bb9a64bff02d2e4cdbfc52d5'
const files = execFileSync('git', ['diff', '--diff-filter=M', '--name-only', base], { encoding: 'utf8' }).trim().split('\n')
const protectedFiles = files.filter(f => /^(supabase|contracts|scripts|src\/(lib|hooks|types)|package(-lock)?\.json|vite\.config|vercel|\.env)/.test(f))
assert.deepEqual(protectedFiles, [])
const printer = ts.createPrinter({ removeComments: true })
const attrs = new Set(['onClick','onChange','onSubmit','onBlur','onDragEnd','disabled','required','minLength','maxLength','pattern','value','checked'])
let handlerCount = 0, attributeCount = 0
const differences = []
function collect(source, file) {
 const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
 const handlers = new Map(), attributes = []
 function visit(n) {
   if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && /^(handleSubmit|submit|search|logout|expire|handleError|retryDelivery|handleSaveEdit|handleDragEnd|confirmClose|confirm|reject)$/.test(n.name.text)) handlers.set(n.name.text, printer.printNode(ts.EmitHint.Unspecified, n.initializer, sf))
   if (ts.isFunctionDeclaration(n) && n.name?.text === 'deliver') handlers.set(n.name.text, printer.printNode(ts.EmitHint.Unspecified,n,sf))
   if (ts.isJsxAttribute(n) && attrs.has(n.name.text)) attributes.push(printer.printNode(ts.EmitHint.Unspecified,n,sf))
   ts.forEachChild(n,visit)
 }
 visit(sf); return {handlers,attributes}
}
for (const file of files.filter(f=>f.endsWith('.tsx'))) {
 const old = collect(execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}),file)
 const next = collect(readFileSync(file,'utf8'),file)
 for (const [name,code] of old.handlers) { assert.equal(next.handlers.get(name),code,`${file}: ${name}`); handlerCount++ }
 const remaining = [...next.attributes]
 for (const attr of old.attributes) {
  const index = remaining.indexOf(attr)
  if (index < 0) differences.push({file,attr})
  else { remaining.splice(index,1);attributeCount++ }
 }
}
assert.deepEqual(differences, [], 'eventos y condiciones originales conservados')
console.log(JSON.stringify({base,protected_files_changed:0,unchanged_named_handlers:handlerCount,unchanged_functional_JSX_attributes:attributeCount,modified_files:files.length},null,2))
