import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import {
  assertCanApproveLiquidation,
  assertCanWrite,
  type AuthenticatedUser,
} from "../../lib/auth-context.ts";
import { HttpError } from "../../lib/http-error.ts";

function user(
  rol: AuthenticatedUser["rol"],
  puedeAprobarLiquidaciones = false,
): AuthenticatedUser {
  return {
    id: 1,
    authUserId: "auth-user",
    email: "user@example.com",
    rol,
    puedeAprobarLiquidaciones,
    idPropietario: null,
  };
}

test("write policy allows ADMIN and EMPLEADO and rejects AUDITOR", () => {
  assert.doesNotThrow(() => assertCanWrite(user("ADMIN")));
  assert.doesNotThrow(() => assertCanWrite(user("EMPLEADO")));
  assert.throws(
    () => assertCanWrite(user("AUDITOR")),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "FORBIDDEN" &&
      error.status === 403 &&
      error.message === "Rol sin permisos de escritura.",
  );
});

test("liquidation approval policy covers admin, delegated employee and auditor", () => {
  assert.doesNotThrow(() => assertCanApproveLiquidation(user("ADMIN")));
  assert.doesNotThrow(() => assertCanApproveLiquidation(user("EMPLEADO", true)));
  assert.throws(
    () => assertCanApproveLiquidation(user("EMPLEADO", false)),
    (error: unknown) => error instanceof HttpError && error.code === "FORBIDDEN",
  );
  // A permission flag cannot elevate an auditor into a writer.
  assert.throws(
    () => assertCanApproveLiquidation(user("AUDITOR", true)),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "FORBIDDEN" &&
      error.message === "No puede aprobar liquidaciones.",
  );
});

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

function isExported(node: ts.Node): boolean {
  return Boolean(ts.getModifiers(node as ts.HasModifiers)?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ));
}

function callsIn(node: ts.Node): Set<string> {
  const calls = new Set<string>();
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
      calls.add(child.expression.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return calls;
}

type RouteMethod = { method: string; body: ts.Block };

function routeMethods(source: string, file: string): RouteMethod[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methods: RouteMethod[] = [];

  for (const statement of parsed.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        assert.ok(
          !HTTP_METHODS.has(element.name.text),
          `${file}: los handlers HTTP deben declararse directamente para poder auditar su flujo.`,
        );
      }
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name &&
      HTTP_METHODS.has(statement.name.text) &&
      statement.body
    ) {
      methods.push({ method: statement.name.text, body: statement.body });
      continue;
    }

    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        HTTP_METHODS.has(declaration.name.text) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) &&
        ts.isBlock(declaration.initializer.body)
      ) {
        methods.push({
          method: declaration.name.text,
          body: declaration.initializer.body,
        });
      }
    }
  }

  return methods;
}

function directCallName(statement: ts.Statement): string | null {
  let expression: ts.Expression | undefined;
  if (ts.isExpressionStatement(statement)) expression = statement.expression;
  if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    expression = statement.declarationList.declarations[0].initializer;
  }
  while (expression && (ts.isAwaitExpression(expression) || ts.isParenthesizedExpression(expression))) {
    expression = expression.expression;
  }
  return expression && ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
    ? expression.expression.text
    : null;
}

test("rejects aliased HTTP exports that cannot be audited in place", () => {
  assert.throws(
    () => routeMethods("const handler = async () => {}; export { handler as POST };", "route.ts"),
    /handlers HTTP deben declararse directamente/,
  );
});

test("every non-cron route method declares an authoritative auth guard and error adapter", () => {
  const root = join(process.cwd(), "app", "api", "v1");
  const files = routeFiles(root).filter((file) => !file.split("/").includes("cron"));
  assert.ok(files.length > 0);

  const adminOnly = new Set([
    "app/api/v1/liquidaciones/[id]/confirmar-pago/route.ts:POST",
    "app/api/v1/propietarios/[id]/adelantos/route.ts:POST",
    "app/api/v1/transacciones/contra-asiento/route.ts:POST",
    "app/api/v1/usuarios/route.ts:POST",
    "app/api/v1/usuarios/route.ts:PATCH",
  ]);
  const approval = "app/api/v1/liquidaciones/[id]/aprobar/route.ts:POST";

  for (const file of files) {
    const relativePath = relative(process.cwd(), file).replaceAll("\\", "/");
    const methods = routeMethods(readFileSync(file, "utf8"), file);
    assert.ok(methods.length > 0, `${relativePath} debe exportar al menos un método HTTP.`);
    for (const { method, body } of methods) {
      const key = `${relativePath}:${method}`;
      assert.equal(body.statements.length, 1, `${key} debe envolver todo el handler en un único try/catch.`);
      const tryStatement = body.statements[0];
      assert.ok(ts.isTryStatement(tryStatement), `${key} debe autenticar dentro del try/catch.`);

      const protectedStatements = tryStatement.tryBlock.statements;
      const firstCall = protectedStatements[0] && directCallName(protectedStatements[0]);
      const secondCall = protectedStatements[1] && directCallName(protectedStatements[1]);

      if (adminOnly.has(key)) assert.equal(firstCall, "requireAdmin", `${key}: ADMIN antes de todo efecto.`);
      else if (key === approval) {
        assert.equal(firstCall, "requireAuthenticatedUser", `${key}: identidad antes de todo efecto.`);
        assert.equal(secondCall, "assertCanApproveLiquidation", `${key}: permiso antes de todo efecto.`);
      } else if (method === "GET") {
        assert.equal(firstCall, "requireAuthenticatedUser", `${key}: identidad antes de toda lectura.`);
      } else {
        assert.equal(firstCall, "requireAuthenticatedUser", `${key}: identidad antes de todo efecto.`);
        assert.equal(secondCall, "assertCanWrite", `${key}: permiso de escritura antes de todo efecto.`);
      }

      assert.ok(
        tryStatement.catchClause && callsIn(tryStatement.catchClause.block).has("handleServiceError"),
        `${key} debe convertir HttpError en el catch.`,
      );
    }
  }
});
