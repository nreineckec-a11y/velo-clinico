// Carga el motor de anonimización (el <script id="motor"> de index.html) para probarlo en Node.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

export function cargarMotor(ruta){
  const archivo = ruta || fileURLToPath(new URL("../index.html", import.meta.url));
  const html = readFileSync(archivo, "utf8");
  const m = html.match(/<script id="motor">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("No se encontró <script id=\"motor\"> en " + archivo);
  const ctx = {globalThis: {}};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(m[1], ctx);
  if (!ctx.Anon) throw new Error("El motor no expuso Anon");
  return ctx.Anon;
}
