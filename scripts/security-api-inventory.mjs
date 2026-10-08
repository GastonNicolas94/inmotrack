import { readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "app", "api");
function visit(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? visit(path) : entry.name === "route.ts" ? [path] : [];
  });
}
const routes = visit(root).map(path => {
  const relativePath = relative(root,path).replaceAll("\\","/");
  const endpoint = "/api/" + relativePath.replace(/\/route\.ts$/,"");
  return {endpoint, category: endpoint.startsWith("/api/v1/cron/") ? "scheduled-review" : "requires-auth-review"};
}).sort((a,b)=>a.endpoint.localeCompare(b.endpoint));
process.stdout.write(JSON.stringify(routes,null,2)+"\n");
if(process.argv.includes("--write")) writeFileSync("docs/security-api-inventory.json",JSON.stringify(routes,null,2)+"\n");
