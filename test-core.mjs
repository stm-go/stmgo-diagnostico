import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importLegacyCsv } from "./diagnostic-core.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(currentDir, "diagnostic-config.json");
const csvPath = path.join(currentDir, "examples", "diagnostico-exemplo.csv");
const outputPath = path.join(currentDir, "examples", "diagnostico-exemplo.json");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const csvText = fs.readFileSync(csvPath).toString("latin1");
const diagnostic = importLegacyCsv(csvText, config);

const sectionScores = Object.fromEntries(
  diagnostic.result.sections.map((section) => [section.sectionId, section.score]),
);

const expected = {
  global: 25,
  gestao: 60,
  controle: 0,
  disponibilidade: 25,
  rastreabilidade: 17,
};

const actual = {
  global: diagnostic.result.score,
  ...sectionScores,
};

for (const [key, value] of Object.entries(expected)) {
  if (actual[key] !== value) {
    throw new Error(`Falha em ${key}: esperado ${value}, recebido ${actual[key]}`);
  }
}

if (diagnostic.unmatchedRows.length > 0) {
  throw new Error(`Perguntas não reconhecidas: ${diagnostic.unmatchedRows.join(" | ")}`);
}

fs.writeFileSync(outputPath, JSON.stringify(diagnostic, null, 2), "utf8");

console.log("Teste concluído com sucesso.");
console.log(
  JSON.stringify(
    {
      client: diagnostic.client,
      scores: actual,
      recommendations: diagnostic.result.recommendations.length,
      generatedFile: path.relative(currentDir, outputPath),
    },
    null,
    2,
  ),
);
