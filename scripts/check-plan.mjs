import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlan } from './release-policy.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function verifyGitRoot(root, cwd = process.cwd()) {
 const resolved = fs.realpathSync(root);
 if (fs.realpathSync(cwd) !== resolved) throw new Error('Run this check from the project Git root');
 const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: resolved, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 if (fs.realpathSync(gitRoot) !== resolved) throw new Error('Project directory is not the same Git root');
 return resolved;
}

export function safeProjectFile(root, reference, allowFragment = true) {
 if (typeof reference !== 'string' || !reference || reference.includes('\\') || reference.includes('\0')) throw new Error('Invalid project file reference');
 const relative = allowFragment ? reference.split('#')[0] : reference;
 if (!relative || path.posix.isAbsolute(relative) || relative.includes(':') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Project file reference must stay inside this project');
 let current = fs.realpathSync(root);
 const base = current;
 for (const part of relative.split('/')) {
  current = path.join(current, part);
  if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not accepted as project evidence or source');
 }
 const resolved = fs.realpathSync(current);
 if (!resolved.startsWith(`${base}${path.sep}`) || !fs.statSync(resolved).isFile()) throw new Error('Expected a regular file inside this project');
 return resolved;
}

export function evidenceReferences(plan, readiness) {
 const refs = [];
 for (const task of plan?.tasks ?? []) {
  refs.push(...(Array.isArray(task.evidence) ? task.evidence : []));
  for (const item of task.workItems ?? []) refs.push(...(Array.isArray(item.evidence) ? item.evidence : []));
 }
 for (const check of Object.values(readiness?.checks ?? {})) refs.push(...(Array.isArray(check.evidence) ? check.evidence : []));
 return [...new Set(refs)];
}

export function collectEvidencePaths(root, references) {
 const present = new Set();
 for (const reference of references) {
  // Missing, outside, or linked evidence stays absent and fails validation.
  try { safeProjectFile(root, reference); present.add(reference); } catch { /* Report through the owning task/check. */ }
 }
 return present;
}

export function loadPlan(root) {
 return JSON.parse(fs.readFileSync(safeProjectFile(root, 'plan/tasks.json'), 'utf8'));
}

async function main() {
 if (process.argv.length !== 2) throw new Error('check-plan accepts no arguments');
 const root = verifyGitRoot(projectRoot);
 const plan = loadPlan(root);
 const result = validatePlan(plan, collectEvidencePaths(root, evidenceReferences(plan)));
 if (result.errors.length) throw new Error(result.errors.join('\n'));
 // Keep the historical validator and release consumers intact. The active V5
 // development track is an additional check, never a substitute release gate.
 const { validateV5Plan, v5EvidenceReferences } = await import('./check-v5-plan.mjs');
 const v5 = validateV5Plan(plan, collectEvidencePaths(root, v5EvidenceReferences(plan)));
 if (v5.errors.length) throw new Error(v5.errors.join('\n'));
 console.log(`Plan checked: ${plan.tasks.length} tasks, ${result.phaseCount} PH, ${result.workItemCount} work items; original ${result.originalTaskCount} task digest preserved; V5 ${v5.phaseCount} phases/${v5.workItemCount} work items, active ${plan.webRebuild.currentPhaseId}; release push lock retired`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try { await main(); } catch (error) { console.error(`Plan check failed: ${error.message}`); process.exitCode = 1; }
}
