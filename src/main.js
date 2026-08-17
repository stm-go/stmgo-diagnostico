import {
  salvarDiagnostico,
  listarDiagnosticos,
  excluirDiagnostico,
  atualizarDiagnostico,
} from "./supabase-api.js";

import {
  revisarRecomendacoesComIa,
  gerarConsideracoesComIa,
} from "./ai-api.js";

const CONFIG = await loadConfig();
const STORAGE_KEY =
  "stmgo-diagnostico-draft-v1";
const LEGACY_STORAGE_KEY =
  "stmgo-diagnostico-passo-4-draft";

const APP_SCREENS = [
  "home",
  "questions",
  "client",
  "review",
  "history",
  "result",
];

const PAGE_SIZE = 8;

const EMPLOYEE_COUNT_OPTIONS = [
  "1-5",
  "6-15",
  "16-30",
  "31-50",
  "51-100",
  "100+",
];

const SEGMENT_OPTIONS = [
  "Tecnologia",
  "Serviços",
  "Comércio e Varejo",
  "Indústria",
  "Saúde",
  "Educação",
  "Financeiro e Contábil",
  "Jurídico",
  "Construção e Engenharia",
  "Logística",
  "Agronegócio",
  "Outros",
];

const SAO_PAULO_DATE_FORMATTER =
  new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      dateStyle:
        "short",

      timeStyle:
        "short",
    }
  );

const emptyState = () => ({
  sectionIndex: 0,
  answers: {},
  client: {},
  updatedAt: null,
  remoteRecordId: null,
  lastResult: null,
  completedAt: null,

  reviewRecommendations: [],
  reviewRecommendationsInitialized: false,
  finalConsiderations: "",
});

let state = emptyState();

let historyState = {
  page: 1,
  pageSize: PAGE_SIZE,
  search: "",
  maturity: "",
  total: 0,
  records: [],
};

let historySearchTimer = null;
let reportPreviewMode = false;

async function loadConfig() {
  const response = await fetch(
    "./diagnostic-config.json",
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      "Não foi possível carregar a configuração do diagnóstico."
    );
  }

  return response.json();
}

function element(id) {
  return document.getElementById(id);
}

function show(name) {
  APP_SCREENS.forEach((screen) => {
    element(`screen-${screen}`)
      ?.classList.toggle(
        "hidden",
        screen !== name
      );
  });
}

function setStatus(
  message,
  type = "info"
) {
  const status =
    element("supabase-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.className =
    `status-toast ${type}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
    );
}

function formatParagraphs(value) {
  const text =
    String(value || "").trim();

  if (!text) {
    return `
      <p>
        As considerações finais ainda não foram preenchidas.
      </p>
    `;
  }

  return text
    .split(/\n\s*\n/)
    .map(
      (paragraph) => `
        <p>
          ${escapeHtml(
            paragraph.trim()
          ).replace(/\n/g, "<br>")}
        </p>
      `
    )
    .join("");
}

function formatDate(value) {
  if (!value) {
    return "Data não informada";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Data não informada";
  }

  return SAO_PAULO_DATE_FORMATTER
    .format(date);
}

function formatReportDate(
  value
) {
  const date =
    value
      ? new Date(value)
      : new Date();

  const safeDate =
    Number.isNaN(
      date.getTime()
    )
      ? new Date()
      : date;

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",

      day: "numeric",
      month: "long",
      year: "numeric",
    }
  ).format(safeDate);
}

function getReportLevel(
  score
) {
  const safeScore =
    Math.max(
      0,
      Math.min(
        100,
        Number(score) || 0
      )
    );

  return (
    CONFIG.maturityLevels.find(
      (level) =>
        safeScore >= level.min &&
        safeScore <= level.max
    ) ||
    CONFIG.maturityLevels[0]
  );
}

function reportLevelColor(
  levelId
) {
  return {
    critical: "#c0392b",
    initial: "#e07820",
    moderate: "#c49a00",
    conscious: "#27ae60",
    optimized: "#1db954",
  }[levelId] || "#e07820";
}

function reportLevelBackground(
  levelId
) {
  return {
    critical:
      "rgba(192, 57, 43, 0.05)",

    initial:
      "rgba(224, 120, 32, 0.05)",

    moderate:
      "rgba(196, 154, 0, 0.05)",

    conscious:
      "rgba(39, 174, 96, 0.05)",

    optimized:
      "rgba(29, 185, 84, 0.05)",
  }[levelId] ||
  "rgba(224, 120, 32, 0.05)";
}

function buildReportGauge(
  value
) {
  const score =
    Math.max(
      0,
      Math.min(
        100,
        Number(value) || 0
      )
    );

  /*
   * 0% = extremo esquerdo
   * 100% = extremo direito
   */
  const degrees =
    (
      score /
      100
    ) * 180;

  const radians =
    (
      (
        degrees -
        180
      ) *
      Math.PI
    ) / 180;

  const cx = 110;
  const cy = 110;
  const radius = 80;

  const endX =
    cx +
    radius *
      Math.cos(
        radians
      );

  const endY =
    cy +
    radius *
      Math.sin(
        radians
      );

  return `
    <svg
      viewBox="0 0 220 120"
      width="220"
      height="120"
      aria-hidden="true"
      style="
        display: block;
        width: 220px;
        height: 120px;
        overflow: visible;
      "
    >
      <defs>
        <linearGradient
          id="stmgoGaugeGradient"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <stop
            offset="0%"
            stop-color="#FE7D53"
          />

          <stop
            offset="100%"
            stop-color="#9F0066"
          />
        </linearGradient>
      </defs>

      <path
        d="
          M30 110
          A80 80 0 0 1
          190 110
        "
        fill="none"
        stroke="#e8e8e8"
        stroke-width="16"
        stroke-linecap="round"
      />

      ${
        score > 0
          ? `
            <path
              d="
                M30 110
                A80 80 0 0 1
                ${endX.toFixed(2)}
                ${endY.toFixed(2)}
              "
              fill="none"
              stroke="url(#stmgoGaugeGradient)"
              stroke-width="16"
              stroke-linecap="round"
            />
          `
          : ""
      }
    </svg>
  `;
}

function answerLabel(value) {
  return (
    CONFIG.answerOptions.find(
      (option) =>
        option.id === value
    )?.label ||
    "Não respondida"
  );
}

function answerScore(id) {
  return (
    CONFIG.answerOptions.find(
      (option) =>
        option.id === id
    )?.score ?? null
  );
}

function saveState() {
  state.updatedAt =
    new Date().toISOString();

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(state)
  );

  updateContinueButton();
}

function loadState() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      ) ||
      localStorage.getItem(
        LEGACY_STORAGE_KEY
      );

    const saved =
      JSON.parse(raw || "null");

    if (
      saved?.answers &&
      saved?.client
    ) {
      state = {
        ...emptyState(),
        ...saved,
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
      );

      localStorage.removeItem(
        LEGACY_STORAGE_KEY
      );
    }
  } catch (error) {
    console.error(
      "Não foi possível ler o rascunho.",
      error
    );
  }
}

function clearState() {
  localStorage.removeItem(
    STORAGE_KEY
  );

  localStorage.removeItem(
    LEGACY_STORAGE_KEY
  );

  state = emptyState();
  updateContinueButton();
}

function hasSavedProgress() {
  return (
    Object.keys(
      state.answers || {}
    ).length > 0 ||
    Object.values(
      state.client || {}
    ).some(Boolean)
  );
}

function updateContinueButton() {
  const button =
    element("continueBtn");

  if (!button) {
    return;
  }

  button.classList.toggle(
    "hidden",
    !hasSavedProgress()
  );

  if (
    hasSavedProgress() &&
    state.updatedAt
  ) {
    element(
      "importStatus"
    ).textContent =
      `Último salvamento do rascunho: ${formatDate(state.updatedAt)}`;
  } else if (
    element("importStatus")
      ?.textContent
      .startsWith(
        "Último salvamento"
      )
  ) {
    element(
      "importStatus"
    ).textContent = "";
  }
}

function calculateSection(section) {
  const values =
    section.questions
      .map((question) =>
        answerScore(
          state.answers[
            question.id
          ]?.value
        )
      )
      .filter(
        (value) =>
          value !== null
      );

  return values.length
    ? Math.round(
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        ) / values.length
      )
    : 0;
}

function severityRank(severity) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[severity] ?? 0;
}

function severityLabel(
  severity
) {
  return {
    critical: "Crítica",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
  }[severity] || "Média";
}

function printReport() {
  const report =
    element(
      "reportContent"
    );

  if (!report) {
    alert(
      "Não foi possível localizar o diagnóstico."
    );

    return;
  }

  const printWindow =
    window.open(
      "",
      "_blank",
      "width=1000,height=900"
    );

  if (!printWindow) {
    alert(
      "O navegador bloqueou a janela de impressão."
    );

    return;
  }

  const baseUrl =
    new URL(
      ".",
      window.location.href
    ).href;

  const reportHtml =
    report.outerHTML;

  const companyName =
    String(
      state.client
        ?.companyName ||
      "cliente"
    ).trim();

  printWindow.document.write(`
    <!DOCTYPE html>

    <html lang="pt-BR">

      <head>

        <meta
          charset="UTF-8"
        >

        <base
          href="${baseUrl}"
        >

        <meta
          name="viewport"
          content="
            width=device-width,
            initial-scale=1
          "
        >

        <title>
          Diagnóstico de Segurança Digital - ${escapeHtml(
            companyName
          )}
        </title>

        <link
          rel="stylesheet"
          href="./src/styles.css"
        >

        <style>

          @page {
            size: A4;
            margin: 0;
          }

          * {
            box-sizing:
              border-box;

            -webkit-print-color-adjust:
              exact !important;

            print-color-adjust:
              exact !important;
          }

          html,
          body {
            width:
              210mm;

            margin:
              0 !important;

            padding:
              0 !important;

            background:
              #ffffff !important;
          }

          body {
            overflow:
              visible !important;
          }


          /*
           * DOCUMENTO
           */

          .client-report,
          .report-document {
            width:
              210mm !important;

            max-width:
              210mm !important;

            margin:
              0 !important;

            padding:
              0 !important;

            border:
              0 !important;

            background:
              #ffffff !important;

            box-shadow:
              none !important;
          }


          /*
           * CADA BLOCO = UMA PÁGINA A4
           */

          .pdf-page {
            width:
              210mm !important;

            height:
              297mm !important;

            min-height:
              297mm !important;

            max-height:
              297mm !important;

            margin:
              0 !important;

            padding:
              0 !important;

            overflow:
              hidden !important;

            box-shadow:
              none !important;

            break-after:
              page !important;

            page-break-after:
              always !important;
          }

          .pdf-page:last-child {
            break-after:
              auto !important;

            page-break-after:
              auto !important;
          }


          /*
           * CANCELA AS REGRAS MOBILE
           * DURANTE A IMPRESSÃO
           */

          .pdf-cover {
            height:
              332px !important;

            min-height:
              332px !important;
          }

          .pdf-page-body {
            padding:
              46px 58px !important;
          }

          .pdf-global-section {
            padding-top:
              40px !important;
          }

          .pdf-page-2
          .pdf-page-body {
            padding-top:
              48px !important;
          }

          .pdf-page-3
          .pdf-page-body {
            padding-top:
              46px !important;
          }

          .pdf-area-grid {
            grid-template-columns:
              repeat(
                2,
                minmax(
                  0,
                  1fr
                )
              ) !important;
          }


          /*
           * ÚLTIMA PÁGINA
           */

          .pdf-next-steps {
            height:
              624px !important;

            min-height:
              624px !important;

            padding:
              64px 60px !important;
          }

          .pdf-final-footer {
            min-height:
              70px !important;

            height:
              auto !important;

            padding:
              20px 60px !important;
          }

          .pdf-footer-info {
            text-align:
              right !important;
          }


          /*
           * NÃO IMPRIME CONTROLES
           */

          button,
          .no-print,
          .report-toolbar,
          .recommendation-actions,
          .recommendation-editor-actions,
          .report-compatibility-data {
            display:
              none !important;
          }


          /*
           * SEGURANÇA CONTRA QUEBRAS
           */

          .pdf-area-card,
          .rec,
          .pdf-maturity-box,
          .pdf-gauge {
            break-inside:
              avoid !important;

            page-break-inside:
              avoid !important;
          }

        </style>

      </head>


      <body>

        ${reportHtml}

        <script>

          window.addEventListener(
            "load",
            async () => {

              try {

                if (
                  document.fonts
                ) {
                  await document
                    .fonts
                    .ready;
                }

                const images =
                  Array.from(
                    document.images
                  );

                await Promise.all(
                  images.map(
                    (image) => {

                      if (
                        image.complete
                      ) {
                        return Promise
                          .resolve();
                      }

                      return new Promise(
                        (resolve) => {

                          image.addEventListener(
                            "load",
                            resolve,
                            {
                              once: true
                            }
                          );

                          image.addEventListener(
                            "error",
                            resolve,
                            {
                              once: true
                            }
                          );

                        }
                      );

                    }
                  )
                );

              } catch (
                error
              ) {

                console.error(
                  "Erro ao preparar impressão:",
                  error
                );

              }

              setTimeout(
                () => {
                  window.focus();
                  window.print();
                },
                250
              );

            }
          );

          window.addEventListener(
            "afterprint",
            () => {
              window.close();
            }
          );

        <\/script>

      </body>

    </html>
  `);

  printWindow.document.close();
}

function buildResult() {
  const scores =
    CONFIG.sections.map(
      (section) => ({
        id: section.id,
        name: section.name,
        score:
          calculateSection(
            section
          ),
      })
    );

  const global =
    Math.round(
      scores.reduce(
        (sum, item) =>
          sum + item.score,
        0
      ) / scores.length
    );

  const level =
    CONFIG.maturityLevels.find(
      (item) =>
        global >= item.min &&
        global <= item.max
    ) ||
    CONFIG.maturityLevels[0];

  const recommendationsByKey =
    new Map(
      CONFIG.recommendations.map(
        (item) => [
          item.key,
          item,
        ]
      )
    );

  const generated =
    new Map();

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      const answer =
        state.answers[
          question.id
        ];

      if (
        !answer ||
        ![
          "partial",
          "no",
        ].includes(answer.value)
      ) {
        continue;
      }

      const base =
        recommendationsByKey.get(
          question.recommendationKey
        );

      if (!base) {
        continue;
      }

      const severity =
        base.severity?.[
          answer.value
        ] || "medium";

      const evidence = {
        questionId:
          question.id,

        question:
          question.text,

        answer:
          answer.value,

        observation:
          answer.observation || "",
      };

      const existing =
        generated.get(
          base.key
        );

      if (existing) {
        existing.evidence.push(
          evidence
        );

        if (
          severityRank(
            severity
          ) >
          severityRank(
            existing.severity
          )
        ) {
          existing.severity =
            severity;
        }
      } else {
        generated.set(
          base.key,
          {
            key: base.key,
            title:
              base.title,
            description:
              base.description,
            priority:
              base.priority,
            severity,
            evidence: [
              evidence,
            ],
          }
        );
      }
    }
  }

  const baseRecommendations =
  [
    ...generated.values(),
  ]
    .sort(
      (a, b) =>
        severityRank(
          b.severity
        ) -
          severityRank(
            a.severity
          ) ||
        a.priority -
          b.priority
    )
    .slice(0, 10);

  const recommendations =
    state
      .reviewRecommendationsInitialized
      ? (
          Array.isArray(
            state.reviewRecommendations
          )
            ? state.reviewRecommendations
            : []
        )
          .map((reviewed) => {
            const base =
              baseRecommendations.find(
                (item) =>
                  item.key ===
                  reviewed.key
              );

            return {
              ...base,
              ...reviewed,

              severity:
                reviewed.severity ||
                base?.severity ||
                "medium",

              priority:
                base?.priority ??
                reviewed.priority ??
                999,

              evidence:
                base?.evidence ||
                reviewed.evidence ||
                [],
            };
          })
          .sort(
            (a, b) =>
              severityRank(
                b.severity
              ) -
                severityRank(
                  a.severity
                ) ||
              a.priority -
                b.priority
          )
          .slice(0, 10)
      : baseRecommendations;

  const summary = {
    yes: 0,
    partial: 0,
    no: 0,
    unknown: 0,
    unanswered: 0,
  };

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      const value =
        state.answers[
          question.id
        ]?.value;

      if (
        value &&
        Object.hasOwn(
          summary,
          value
        )
      ) {
        summary[value] += 1;
      } else {
        summary.unanswered += 1;
      }
    }
  }
  

  return {
    global,
    level,
    scores,
    recommendations,
    summary,

    finalConsiderations:
      String(
        state.finalConsiderations || ""
      ).trim(),

    questionnaire: {
      id:
        CONFIG.id ||
        "questionnaire-unknown",

      schemaVersion:
        Number(
          CONFIG.schemaVersion
        ) || 1,

      status:
        CONFIG.approvalStatus ||
        "pending-approval",
    },
  };
}

function renderSection() {
  const section =
    CONFIG.sections[
      state.sectionIndex
    ];

  element(
    "stepLabel"
  ).textContent =
    `Etapa ${state.sectionIndex + 1} de 6`;

  element(
    "sectionTitle"
  ).textContent =
    section.name;

  element(
    "sectionDescription"
  ).textContent =
    section.description;

  element(
    "progressBar"
  ).style.width =
    `${((state.sectionIndex + 1) / 6) * 100}%`;

  const container =
    element(
      "questionsContainer"
    );

  container.innerHTML = "";

  section.questions.forEach(
    (question) => {
      const current =
        state.answers[
          question.id
        ] || {
          value: null,
          observation: "",
        };

      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "question";

      wrapper.innerHTML = `
        <div class="question-title">
          ${question.order}. ${escapeHtml(question.text)}
        </div>

        <div class="options">
          ${CONFIG.answerOptions
            .map(
              (option) => `
                <button
                  type="button"
                  class="option ${current.value === option.id ? "selected" : ""}"
                  data-q="${question.id}"
                  data-v="${option.id}"
                >
                  ${escapeHtml(option.label)}
                </button>
              `
            )
            .join("")}
        </div>

        <textarea
          data-obs="${question.id}"
          placeholder="Observação opcional"
        >${escapeHtml(current.observation || "")}</textarea>
      `;

      container.appendChild(
        wrapper
      );
    }
  );

  container
    .querySelectorAll(
      "[data-q]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          state.answers[
            button.dataset.q
          ] = {
            ...(
              state.answers[
                button.dataset.q
              ] || {}
            ),

            value:
              button.dataset.v,
          };

          state.reviewRecommendations =
            [];

          state
            .reviewRecommendationsInitialized =
            false;

          saveState();
          renderSection();
        }
      );
    });

  container
    .querySelectorAll(
      "[data-obs]"
    )
    .forEach((textarea) => {
      textarea.addEventListener(
        "input",
        () => {
          state.answers[
            textarea.dataset.obs
          ] = {
            ...(
              state.answers[
                textarea.dataset.obs
              ] || {}
            ),

            observation:
              textarea.value,
          };

          saveState();
        }
      );
    });

  element(
    "prevBtn"
  ).style.visibility =
    state.sectionIndex === 0
      ? "hidden"
      : "visible";
}

function sectionMissing(
  section
) {
  return section.questions.filter(
    (question) =>
      !state.answers[
        question.id
      ]?.value
  );
}

const CLIENT_FIELDS = [
  "companyName",
  "contactName",
  "contactEmail",
  "contactPhone",
  "employeeCount",
  "segment",
  "consultantName",
  "clientNotes",
];

function saveClient() {
  CLIENT_FIELDS.forEach(
    (id) => {
      state.client[id] =
        element(id)
          ?.value.trim() || "";
    }
  );

  saveState();
}

function fillClientForm() {
  CLIENT_FIELDS.forEach(
    (id) => {
      if (element(id)) {
        element(id).value =
          state.client[id] || "";
      }
    }
  );
}

function renderReviewRisks() {
  const container =
    element("reviewRiskSummary");

  if (!container) {
    return;
  }

  const risks = [];

  CONFIG.sections.forEach(
    (section) => {
      section.questions.forEach(
        (question) => {
          const answer =
            state.answers[
              question.id
            ] || {};

          const value =
            answer.value;

          const observation =
            String(
              answer.observation || ""
            ).trim();

          const needsAttention =
            !value ||
            [
              "no",
              "partial",
              "unknown",
            ].includes(value) ||
            Boolean(observation);

          if (!needsAttention) {
            return;
          }

          risks.push({
            section:
              section.name,

            question:
              question.text,

            value:
              value || "missing",

            observation,
          });
        }
      );
    }
  );

  if (!risks.length) {
    container.innerHTML = `
      <div class="empty-state compact">
        Nenhum ponto crítico foi identificado.
      </div>
    `;

    return;
  }

  container.innerHTML =
    risks
      .map((risk) => {
        let className = "";

        if (
          risk.value === "partial"
        ) {
          className = "partial";
        }

        if (
          risk.value === "unknown" ||
          risk.value === "missing" ||
          risk.value === "yes"
        ) {
          className = "unknown";
        }

        const label =
          risk.value === "missing"
            ? "Sem resposta"
            : answerLabel(
                risk.value
              );

        return `
          <article
            class="review-risk-item ${className}"
          >
            <span
              class="review-risk-answer"
            >
              ${escapeHtml(label)}
            </span>

            <h4>
              ${escapeHtml(
                risk.question
              )}
            </h4>

            <p>
              Área:
              <strong>
                ${escapeHtml(
                  risk.section
                )}
              </strong>
            </p>

            ${
              risk.observation
                ? `
                  <p>
                    Observação:
                    ${escapeHtml(
                      risk.observation
                    )}
                  </p>
                `
                : ""
            }
          </article>
        `;
      })
      .join("");
}

function collectAttentionPoints() {
  const points = [];

  CONFIG.sections.forEach(
    (section) => {
      section.questions.forEach(
        (question) => {
          const answer =
            state.answers[
              question.id
            ] || {};

          const value =
            answer.value;

          const observation =
            String(
              answer.observation || ""
            ).trim();

          if (
            value === "yes" &&
            !observation
          ) {
            return;
          }

          points.push({
            section:
              section.name,

            question:
              question.text,

            answer:
              value
                ? answerLabel(value)
                : "Sem resposta",

            observation,
          });
        }
      );
    }
  );

  return points;
}

function buildAiDiagnosticPayload() {
  const result =
    buildResult();

  return {
    client: {
      ...state.client,
    },

    globalScore:
      result.global,

    maturityLevel:
      result.level.name,

    scores:
      result.scores,

    attentionPoints:
      collectAttentionPoints(),

    baseRecommendations:
      result.recommendations.map(
        (recommendation) => ({
          key:
            recommendation.key,

          title:
            recommendation.title,

          description:
            recommendation.description,

          severity:
            recommendation.severity,
        })
      ),
  };
}

function renderReviewRecommendations() {
  const container =
    element(
      "reviewRecommendationsPreview"
    );

  if (!container) {
    return;
  }

  if (
    !state
      .reviewRecommendationsInitialized
  ) {
    const result =
      buildResult();

    state.reviewRecommendations =
      structuredClone(
        result.recommendations || []
      );

    state
      .reviewRecommendationsInitialized =
      true;

    saveState();
  }

  const recommendations =
    state.reviewRecommendations ||
    [];

  if (!recommendations.length) {
    container.innerHTML = `
      <div class="empty-state compact">
        Nenhuma recomendação prioritária foi gerada.
      </div>
    `;

    return;
  }

  container.innerHTML =
  recommendations
    .map(
      (
        recommendation,
        index
      ) => {
        const businessImpact =
          String(
            recommendation
              .businessImpact ||
            ""
          ).trim();

        const suggestedDeadline =
          String(
            recommendation
              .suggestedDeadline ||
            ""
          ).trim();

        return `
          <article
            class="rec"
            data-recommendation-card="${index}"
          >
            <div class="rec-head">
              <small>
                Prioridade ${index + 1}
              </small>

              <span
                class="severity severity-${escapeHtml(
                  recommendation.severity ||
                  "medium"
                )}"
              >
                ${escapeHtml(
                  severityLabel(
                    recommendation.severity ||
                    "medium"
                  )
                )}
              </span>
            </div>

            <h3>
              ${escapeHtml(
                recommendation.title
              )}
            </h3>

            <p class="recommendation-description">
              ${escapeHtml(
                recommendation.description
              )}
            </p>

            ${
              businessImpact
                ? `
                  <div class="recommendation-detail">
                    <strong>
                      Impacto para o negócio
                    </strong>

                    <p>
                      ${escapeHtml(
                        businessImpact
                      )}
                    </p>
                  </div>
                `
                : ""
            }

            ${
            suggestedDeadline
              ? `
                <div class="recommendation-deadline">
                  <span>
                    Prazo sugerido
                  </span>

                  <strong>
                    ${escapeHtml(
                      suggestedDeadline
                    )}
                  </strong>
                </div>
              `
              : ""
          }

          <div class="recommendation-actions">
            <button
              type="button"
              class="btn btn-secondary btn-small"
              data-edit-recommendation="${index}"
            >
              Editar
            </button>

            <button
              type="button"
              class="btn btn-danger btn-small"
              data-delete-recommendation="${index}"
            >
              Excluir
            </button>
          </div>

          </article>
        `;
      }
    )
    .join("");

    bindRecommendationActions();
}

function editRecommendation(
  index
) {
  const recommendation =
    state.reviewRecommendations[
      index
    ];

  if (!recommendation) {
    return;
  }

  const container =
    element(
      "reviewRecommendationsPreview"
    );

  const card =
    container?.querySelector(
      `[data-recommendation-card="${index}"]`
    );

  if (!card) {
    return;
  }

  card.innerHTML = `
    <div class="recommendation-editor">
      <div class="recommendation-editor-field">
        <label>
          Título
        </label>

        <input
          type="text"
          data-rec-title
          value="${escapeHtml(
            recommendation.title || ""
          )}"
        >
      </div>

      <div class="recommendation-editor-field">
        <label>
          Severidade
        </label>

        <select data-rec-severity>
          <option
            value="low"
            ${
              recommendation.severity ===
              "low"
                ? "selected"
                : ""
            }
          >
            Baixa
          </option>

          <option
            value="medium"
            ${
              recommendation.severity ===
              "medium"
                ? "selected"
                : ""
            }
          >
            Média
          </option>

          <option
            value="high"
            ${
              recommendation.severity ===
              "high"
                ? "selected"
                : ""
            }
          >
            Alta
          </option>

          <option
            value="critical"
            ${
              recommendation.severity ===
              "critical"
                ? "selected"
                : ""
            }
          >
            Crítica
          </option>
        </select>
      </div>

      <div class="recommendation-editor-field">
        <label>
          Recomendação
        </label>

        <textarea
          data-rec-description
          rows="4"
        >${escapeHtml(
          recommendation.description || ""
        )}</textarea>
      </div>

      <div class="recommendation-editor-field">
        <label>
          Impacto para o negócio
        </label>

        <textarea
          data-rec-impact
          rows="3"
        >${escapeHtml(
          recommendation.businessImpact || ""
        )}</textarea>
      </div>

      <div class="recommendation-editor-field">
        <label>
          Prazo sugerido
        </label>

        <input
          type="text"
          data-rec-deadline
          value="${escapeHtml(
            recommendation.suggestedDeadline ||
            ""
          )}"
          placeholder="Ex.: Até 30 dias"
        >
      </div>

      <div class="recommendation-editor-actions">
        <button
          type="button"
          class="btn btn-primary btn-small"
          data-save-recommendation
        >
          Salvar alterações
        </button>

        <button
          type="button"
          class="btn btn-secondary btn-small"
          data-cancel-recommendation
        >
          Cancelar
        </button>
      </div>
    </div>
  `;

  card
    .querySelector(
      "[data-save-recommendation]"
    )
    ?.addEventListener(
      "click",
      () => {
        const title =
          card
            .querySelector(
              "[data-rec-title]"
            )
            ?.value.trim() ||
          "";

        const description =
          card
            .querySelector(
              "[data-rec-description]"
            )
            ?.value.trim() ||
          "";

        if (
          !title ||
          !description
        ) {
          alert(
            "Informe o título e a recomendação."
          );

          return;
        }

        state.reviewRecommendations[
          index
        ] = {
          ...recommendation,

          title,

          description,

          severity:
            card.querySelector(
              "[data-rec-severity]"
            )?.value ||
            "medium",

          businessImpact:
            card
              .querySelector(
                "[data-rec-impact]"
              )
              ?.value.trim() ||
            "",

          suggestedDeadline:
            card
              .querySelector(
                "[data-rec-deadline]"
              )
              ?.value.trim() ||
            "",
        };

        state
          .reviewRecommendationsInitialized =
          true;

        saveState();

        resetReviewApproval();

        renderReviewRecommendations();

        setStatus(
          "Recomendação atualizada.",
          "success"
        );
      }
    );

  card
    .querySelector(
      "[data-cancel-recommendation]"
    )
    ?.addEventListener(
      "click",
      renderReviewRecommendations
    );
}

function deleteRecommendation(
  index
) {
  const recommendation =
    state.reviewRecommendations[
      index
    ];

  if (!recommendation) {
    return;
  }

  const confirmed =
    confirm(
      `Excluir a recomendação "${recommendation.title}"?`
    );

  if (!confirmed) {
    return;
  }

  state.reviewRecommendations.splice(
    index,
    1
  );

  state
    .reviewRecommendationsInitialized =
    true;

  saveState();

  resetReviewApproval();

  renderReviewRecommendations();

  setStatus(
    "Recomendação excluída.",
    "success"
  );
}

function bindRecommendationActions() {
  const container =
    element(
      "reviewRecommendationsPreview"
    );

  if (!container) {
    return;
  }

  container
    .querySelectorAll(
      "[data-edit-recommendation]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            editRecommendation(
              Number(
                button.dataset
                  .editRecommendation
              )
            );
          }
        );
      }
    );

  container
    .querySelectorAll(
      "[data-delete-recommendation]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            deleteRecommendation(
              Number(
                button.dataset
                  .deleteRecommendation
              )
            );
          }
        );
      }
    );
}

async function reviewRecommendationsWithAi() {
  const button =
    element(
      "reviewRecommendationsAiBtn"
    );

  if (!button) {
    return;
  }

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "Revisando...";

  setStatus(
    "A IA está revisando as recomendações.",
    "info"
  );

  try {
    const recommendations =
      await revisarRecomendacoesComIa(
        buildAiDiagnosticPayload()
      );

      state.reviewRecommendations =
        recommendations;

      state
        .reviewRecommendationsInitialized =
        true;

      saveState();

      renderReviewRecommendations();

    const approval =
      element(
        "reviewRecommendationsApproved"
      );

    if (approval) {
      approval.checked = false;
    }

    updateReviewApproval();

    setStatus(
      "Recomendações revisadas com IA. Confira o conteúdo antes de aprovar.",
      "success"
    );
  } catch (error) {
    console.error(
      "Erro ao revisar recomendações:",
      error
    );

    setStatus(
      error.message ||
        "Não foi possível revisar as recomendações.",
      "error"
    );

    alert(
      `Não foi possível revisar as recomendações com IA.\n\n${error.message}`
    );
  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}

async function generateFinalConsiderationsWithAi() {
  const button =
    element(
      "reviewFinalConsiderationsAiBtn"
    );

  if (!button) {
    return;
  }

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent =
    "Gerando...";

  setStatus(
    "A IA está gerando as considerações finais.",
    "info"
  );

  try {
    const text =
      await gerarConsideracoesComIa(
        buildAiDiagnosticPayload()
      );

    state.finalConsiderations =
      text;

    const textarea =
      element(
        "reviewFinalConsiderations"
      );

    if (textarea) {
      textarea.value = text;
    }

    saveState();

    const approval =
      element(
        "reviewConsiderationsApproved"
      );

    if (approval) {
      approval.checked = false;
    }

    updateReviewApproval();

    setStatus(
      "Considerações finais geradas. Revise o texto antes de aprovar.",
      "success"
    );
  } catch (error) {
    console.error(
      "Erro ao gerar considerações:",
      error
    );

    setStatus(
      error.message ||
        "Não foi possível gerar as considerações.",
      "error"
    );

    alert(
      `Não foi possível gerar as considerações com IA.\n\n${error.message}`
    );
  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}

function updateReviewApproval() {
  const checkboxIds = [
    "reviewDataApproved",
    "reviewAnswersApproved",
    "reviewRecommendationsApproved",
    "reviewConsiderationsApproved",
  ];

const considerationsText =
  element(
    "reviewFinalConsiderations"
  )?.value.trim() || "";

const allApproved =
  checkboxIds.every(
    (id) =>
      element(id)?.checked
  ) &&
  Boolean(considerationsText);

  const generateButton =
    element("generateBtn");

  if (generateButton) {
    generateButton.disabled =
      !allApproved;
  }

  const previewButton =
    element("reportPreviewBtn");

  if (previewButton) {
    previewButton.disabled = !allApproved;
  }

  const status =
    document.querySelector(
      ".review-status"
    );

  if (status) {
    status.innerHTML =
      allApproved
        ? `
          <span
            class="review-status-dot"
          ></span>
          Revisão aprovada
        `
        : `
          <span
            class="review-status-dot"
          ></span>
          Aguardando revisão
        `;
  }
}

function resetReviewApproval() {
  [
    "reviewDataApproved",
    "reviewAnswersApproved",
    "reviewRecommendationsApproved",
    "reviewConsiderationsApproved",
  ].forEach((id) => {
    const checkbox =
      element(id);

    if (checkbox) {
      checkbox.checked = false;
    }
  });

  updateReviewApproval();
}

function renderReview() {
  saveClient();

  let answered = 0;
  let unknown = 0;
  let total = 0;

  const client =
    state.client;

  let html = `
    <div class="review-section">
      <h3>
        ${escapeHtml(
          client.companyName ||
          "Empresa não informada"
        )}
      </h3>

      <div class="review-line">
        <span>Contato</span>

        <strong>
          ${escapeHtml(
            client.contactName ||
            "-"
          )}
        </strong>
      </div>

      <div class="review-line">
        <span>E-mail</span>

        <strong>
          ${escapeHtml(
            client.contactEmail ||
            "-"
          )}
        </strong>
      </div>

      <div class="review-line">
        <span>Telefone</span>

        <strong>
          ${escapeHtml(
            client.contactPhone ||
            "-"
          )}
        </strong>
      </div>

      <div class="review-line">
        <span>Segmento</span>

        <strong>
          ${escapeHtml(
            client.segment ||
            "-"
          )}
        </strong>
      </div>

      <div class="review-line">
        <span>Consultor responsável</span>

        <strong>
          ${escapeHtml(
            client.consultantName ||
            "-"
          )}
        </strong>
      </div>

      <div class="review-line">
        <span>Versão do questionário</span>

        <strong>
          ${escapeHtml(
            CONFIG.id ||
            "Não informada"
          )}
        </strong>
      </div>

      <div class="review-line">
        <span>Status das perguntas</span>

        <strong>
          ${
            CONFIG.approvalStatus ===
            "approved"
              ? "Aprovadas"
              : "Aguardando aprovação"
          }
        </strong>
      </div>

      <div class="review-line">
        <span>Colaboradores</span>

        <strong>
          ${escapeHtml(
            client.employeeCount ||
            "-"
          )}
        </strong>
      </div>

      ${
        client.clientNotes
          ? `
            <div class="review-section">
              <strong>
                Observações gerais
              </strong>

              <p>
                ${escapeHtml(
                  client.clientNotes
                )}
              </p>
            </div>
          `
          : ""
      }
    </div>
  `;

  CONFIG.sections.forEach(
    (section) => {
      const sectionAnswered =
        section.questions.filter(
          (question) =>
            state.answers[
              question.id
            ]?.value
        ).length;

      const sectionUnknown =
        section.questions.filter(
          (question) =>
            state.answers[
              question.id
            ]?.value ===
            "unknown"
        ).length;

      answered +=
        sectionAnswered;

      unknown +=
        sectionUnknown;

      total +=
        section.questions.length;

      html += `
        <div class="review-section">
          <div class="review-line">
            <strong>
              ${escapeHtml(
                section.name
              )}
            </strong>

            <span>
              ${sectionAnswered}
              de
              ${section.questions.length}
              respondidas
            </span>
          </div>
        </div>
      `;
    }
  );

  const reviewContent =
    element("reviewContent");

  if (reviewContent) {
    reviewContent.innerHTML =
      html;
  }

  const messages = [];

  if (answered < total) {
    messages.push(
      `${total - answered} pergunta(s) ainda não respondida(s).`
    );
  }

  if (unknown) {
    messages.push(
      `${unknown} resposta(s) marcada(s) como “Não sabe responder”.`
    );
  }

  const warning =
    element("reviewWarning");

  if (warning) {
    warning.textContent =
      messages.join(" ");

    warning.classList.toggle(
      "hidden",
      messages.length === 0
    );
  }

  renderReviewRisks();
  renderReviewRecommendations();

  const recommendationsAiButton =
  element(
    "reviewRecommendationsAiBtn"
  );

  if (recommendationsAiButton) {
    recommendationsAiButton.disabled =
      !state.reviewRecommendations
        .length;
  }

  const considerationsAiButton =
    element(
      "reviewFinalConsiderationsAiBtn"
    );

  if (considerationsAiButton) {
    considerationsAiButton.disabled =
      false;
  }

  const considerations =
    element(
      "reviewFinalConsiderations"
    );

  if (considerations) {
    considerations.value =
      state.finalConsiderations ||
      "";
  }

  resetReviewApproval();
  saveState();
}

function summarizeAnswers(
  answers
) {
  const summary = {
    yes: 0,
    partial: 0,
    no: 0,
    unknown: 0,
    unanswered: 0,
  };

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      const value =
        answers[
          question.id
        ]?.value;

      if (
        value &&
        Object.hasOwn(
          summary,
          value
        )
      ) {
        summary[value] += 1;
      } else {
        summary.unanswered += 1;
      }
    }
  }

  return summary;
}

function convertSupabaseRecord(
  record
) {
  const level =
    CONFIG.maturityLevels.find(
      (item) =>
        item.name ===
        record.maturity_level
    ) ||
    CONFIG.maturityLevels[0];

  return {
    id:
      record.id,

    completedAt:
      record.created_at,

    updatedAt:
      record.updated_at ||
      record.created_at,

    client: {
      companyName:
        record.company_name ||
        "",

      contactName:
        record.contact_name ||
        "",

      contactEmail:
        record.contact_email ||
        "",

      contactPhone:
        record.contact_phone ||
        "",

      employeeCount:
        record.employee_count ||
        "",

      segment:
        record.segment ||
        "",

      consultantName:
        record.consultant_name ||
        "",

      clientNotes:
        record.client_notes ||
        "",
    },

    answers:
      record.answers ||
      {},

    result: {
      global:
        record.global_score,

      level,

      finalConsiderations:
        record.final_considerations ||
        "",

      approval: {
        status:
          record.approval_status ||
          "draft",

        approvedAt:
          record.approved_at ||
          null,

        approvedBy:
          record.approved_by ||
          record.consultant_name ||
          "",
      },

      questionnaire: {
        id:
          record.questionnaire_id ||
          "diagnostico-legado",

        schemaVersion:
          record
            .questionnaire_schema_version ||
          1,

        status:
          record.questionnaire_status ||
          "legacy",
      },

      scores: [
        {
          id: "gestao",
          name: "Gestão",
          score:
            record.management_score,
        },
        {
          id: "controle",
          name: "Controle",
          score:
            record.control_score,
        },
        {
          id:
            "disponibilidade",
          name:
            "Disponibilidade",
          score:
            record.availability_score,
        },
        {
          id:
            "rastreabilidade",
          name:
            "Rastreabilidade",
          score:
            record.traceability_score,
        },
      ],

      recommendations:
        record.recommendations ||
        [],

      summary:
        summarizeAnswers(
          record.answers || {}
        ),
    },
  };
}

function renderStoredResult(
  record
) {
  const {
    result,
    client,
  } = record;

  const companyName =
    String(
      client.companyName ||
      "Cliente"
    ).trim();

  const companyUpper =
    companyName.toUpperCase();

  const emittedDate =
    formatReportDate(
      record.completedAt ||
      record.updatedAt ||
      new Date()
    );

  const globalScore =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          result.global
        ) || 0
      )
    );

  const globalLevel =
    result.level ||
    getReportLevel(
      globalScore
    );

  const globalColor =
    reportLevelColor(
      globalLevel.id
    );

  /*
   * CAPA
   */

  if (
    element(
      "resultCompany"
    )
  ) {
    element(
      "resultCompany"
    ).textContent =
      companyUpper;
  }

  if (
    element(
      "resultMeta"
    )
  ) {
    element(
      "resultMeta"
    ).textContent =
      `Emitido em ${emittedDate} - confidencial`;
  }


  /*
   * EMPRESA NA PÁGINA 3
   */

  if (
    element(
      "actionsCompanyName"
    )
  ) {
    element(
      "actionsCompanyName"
    ).textContent =
      companyUpper;
  }


  /*
   * RODAPÉ
   */

  if (
    element(
      "reportFooterCompany"
    )
  ) {
    element(
      "reportFooterCompany"
    ).textContent =
      companyUpper;
  }

  if (
    element(
      "reportFooterDate"
    )
  ) {
    element(
      "reportFooterDate"
    ).textContent =
      `Emitido em ${emittedDate}`;
  }


  /*
   * SCORE GLOBAL
   */

  const gauge =
    element(
      "scoreGauge"
    );

  if (gauge) {
    gauge.innerHTML = `
      ${buildReportGauge(
        globalScore
      )}

      <div
        class="pdf-gauge-content"
      >
        <div
          class="score-number"
          id="globalScore"
          style="
            color:
              ${globalColor};
          "
        >
          ${globalScore}%
        </div>

        <div
          class="level"
          id="maturityLevel"
          style="
            background:
              ${globalColor};
            color:
              #ffffff;
          "
        >
          ${escapeHtml(
            globalLevel.name
          )}
        </div>
      </div>
    `;
  }


  /*
   * DESCRIÇÃO DA MATURIDADE
   */

  if (
    element(
      "maturityDescription"
    )
  ) {
    element(
      "maturityDescription"
    ).textContent =
      globalLevel.description ||
      "";
  }

  const maturityBox =
    document.querySelector(
      ".pdf-maturity-box"
    );

  if (maturityBox) {
    maturityBox.style
      .borderLeftColor =
      globalColor;

    maturityBox.style
      .background =
      reportLevelBackground(
        globalLevel.id
      );
  }


  /*
   * SCORE POR ÁREA
   */

  const areaScores =
    element(
      "areaScores"
    );

  if (areaScores) {
    areaScores.innerHTML =
      (result.scores || [])
        .map(
          (score) => {
            const value =
              Math.max(
                0,
                Math.min(
                  100,
                  Number(
                    score.score
                  ) || 0
                )
              );

            const level =
              getReportLevel(
                value
              );

            return `
              <article
                class="
                  score-card
                  pdf-area-card
                  level-${escapeHtml(
                    level.id
                  )}
                "
              >
                <span>
                  ${escapeHtml(
                    score.name
                  )}
                </span>

                <strong
                  class="pdf-area-score-value"
                >
                  ${value}%
                </strong>

                <div
                  class="pdf-area-progress"
                >
                  <div
                    class="pdf-area-progress-bar"
                    style="
                      width:
                        ${value}%;
                    "
                  ></div>
                </div>

                <div
                  class="pdf-area-level"
                >
                  ${escapeHtml(
                    level.name
                  )}
                </div>
              </article>
            `;
          }
        )
        .join("");
  }


  /*
   * AÇÕES RECOMENDADAS
   *
   * O modelo de referência possui
   * duas ações prioritárias na
   * terceira página.
   */

  const recommendations =
    Array.isArray(
      result.recommendations
    )
      ? result.recommendations
          .slice(
            0,
            2
          )
      : [];

  const recommendationsOutput =
    element(
      "recommendations"
    );

  if (
    recommendationsOutput
  ) {
    if (
      !recommendations.length
    ) {
      recommendationsOutput
        .innerHTML = `
          <article class="rec">
            <div class="rec-head">
              <small>
                PLANO DE AÇÃO
              </small>
            </div>

            <h3>
              Nenhuma ação prioritária identificada
            </h3>

            <p class="recommendation-description">
              O diagnóstico não gerou ações prioritárias para este cenário.
            </p>
          </article>
        `;
    } else {
      recommendationsOutput
        .innerHTML =
        recommendations
          .map(
            (
              recommendation,
              index
            ) => {
              const description =
                String(
                  recommendation
                    .description ||
                  ""
                ).trim();

              const businessImpact =
                String(
                  recommendation
                    .businessImpact ||
                  ""
                ).trim();

              /*
               * No relatório do cliente,
               * impacto e recomendação
               * viram um único texto,
               * como no modelo original.
               */
              const actionText =
                [
                  description,
                  businessImpact,
                ]
                  .filter(
                    Boolean
                  )
                  .join(" ");

              return `
                <article
                  class="rec"
                >
                  <div
                    class="rec-head"
                  >
                    <small>
                      AÇÃO ${index + 1}
                    </small>
                  </div>

                  <h3>
                    ${escapeHtml(
                      recommendation.title ||
                      `Ação ${index + 1}`
                    )}
                  </h3>

                  <p
                    class="recommendation-description"
                  >
                    ${escapeHtml(
                      actionText
                    )}
                  </p>
                </article>
              `;
            }
          )
          .join("");
    }
  }


  /*
   * CONSIDERAÇÕES
   */

  const finalConsiderations =
    result.finalConsiderations ||
    state.finalConsiderations ||
    "";

  const considerationsOutput =
    element(
      "finalConsiderationsOutput"
    );

  if (
    considerationsOutput
  ) {
    considerationsOutput
      .innerHTML =
      formatParagraphs(
        finalConsiderations
      );
  }
}

function loadRecordIntoState(
  record,
  edit = false
) {
  state = {
    ...emptyState(),

    remoteRecordId:
      record.id,

    sectionIndex: 0,

    client: {
      ...record.client,
    },

    answers:
      structuredClone(
        record.answers || {}
      ),

    lastResult:
      record.result,

    finalConsiderations:
    record.result
      .finalConsiderations ||
    "",

    completedAt:
      record.completedAt,
  };

  saveState();

  if (edit) {
    fillClientForm();
    renderSection();
    show("questions");

    setStatus(
      `Editando diagnóstico de ${record.client.companyName || "cliente"}.`,
      "info"
    );
  } else {
    setReportPreviewMode(
      false
    );

    renderStoredResult(
      record
    );

    show("result");
  }

  window.scrollTo(0, 0);
}

function renderHistoryRecords() {
  const list =
    element("historyList");

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        historyState.total /
          historyState.pageSize
      )
    );

  element(
    "historyCount"
  ).textContent =
    `${historyState.total} diagnóstico(s) encontrado(s).`;

  element(
    "historyPageInfo"
  ).textContent =
    `Página ${historyState.page} de ${totalPages}`;

  element(
    "historyPrevPage"
  ).disabled =
    historyState.page <= 1;

  element(
    "historyNextPage"
  ).disabled =
    historyState.page >=
    totalPages;

  element(
    "historyPagination"
  ).classList.toggle(
    "hidden",
    historyState.total === 0
  );

  if (
    !historyState.records.length
  ) {
    list.innerHTML = `
      <div class="empty-state">
        Nenhum diagnóstico encontrado com os filtros selecionados.
      </div>
    `;

    return;
  }

  list.innerHTML =
    historyState.records
      .map(
        (record) => {
          const approval =
            record.result
              ?.approval || {};

          const isApproved =
            approval.status ===
            "approved";

          const approvalLabel =
            isApproved
              ? "Aprovado"
              : "Em revisão";

          const approvalClass =
            isApproved
              ? "approved"
              : "draft";

          return `
            <div class="history-item">
              <div>
                <div class="history-title">
                  ${escapeHtml(
                    record.client
                      .companyName ||
                    "Cliente"
                  )}
                </div>

                <div class="history-meta">
                  ${formatDate(
                    record.updatedAt
                  )}
                  ·
                  ${escapeHtml(
                    record.client
                      .contactName ||
                    "Sem contato"
                  )}
                  ·
                  ${escapeHtml(
                    record.result
                      .level.name
                  )}
                </div>

                <div class="history-status-row">
                  <span
                    class="approval-badge approval-${approvalClass}"
                  >
                    ${approvalLabel}
                  </span>

                  ${
                    isApproved &&
                    approval.approvedBy
                      ? `
                        <span class="history-approved-by">
                          por
                          ${escapeHtml(
                            approval.approvedBy
                          )}
                        </span>
                      `
                      : ""
                  }
                </div>
              </div>

              <div>
                <div class="history-score">
                  ${record.result.global}%
                </div>

                <div class="history-actions">
                  <button
                    class="btn btn-secondary btn-small"
                    data-open-remote="${record.id}"
                  >
                    Abrir
                  </button>

                  <button
                    class="btn btn-secondary btn-small"
                    data-edit-remote="${record.id}"
                  >
                    Editar
                  </button>

                  <button
                    class="btn btn-danger btn-small"
                    data-delete-remote="${record.id}"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          `;
        }
      )
      .join("");

      bindHistoryActions();
}

function bindHistoryActions() {
  const findRecord =
    (id) =>
      historyState.records.find(
        (record) =>
          record.id === id
      );

  element("historyList")
    .querySelectorAll(
      "[data-open-remote]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const record =
            findRecord(
              button.dataset.openRemote
            );

          if (record) {
            loadRecordIntoState(
              record,
              false
            );
          }
        }
      );
    });

  element("historyList")
    .querySelectorAll(
      "[data-edit-remote]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const record =
            findRecord(
              button.dataset.editRemote
            );

          if (record) {
            loadRecordIntoState(
              record,
              true
            );
          }
        }
      );
    });

  element("historyList")
    .querySelectorAll(
      "[data-delete-remote]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const record =
            findRecord(
              button.dataset.deleteRemote
            );

          if (!record) {
            return;
          }

          if (
            !confirm(
              `Excluir o diagnóstico de ${record.client.companyName || "este cliente"}?\n\nEssa ação não poderá ser desfeita.`
            )
          ) {
            return;
          }

          button.disabled =
            true;

          button.textContent =
            "Excluindo...";

          try {
            await excluirDiagnostico(
              record.id
            );

            const remainingOnPage =
              historyState.records.length -
              1;

            if (
              remainingOnPage === 0 &&
              historyState.page > 1
            ) {
              historyState.page -= 1;
            }

            await renderHistory();

            setStatus(
              "Diagnóstico excluído do Supabase.",
              "success"
            );
          } catch (error) {
            setStatus(
              error.message ||
                "Não foi possível excluir.",
              "error"
            );

            button.disabled =
              false;

            button.textContent =
              "Excluir";
          }
        }
      );
    });
}

async function renderHistory() {
  element(
    "historyList"
  ).innerHTML = `
    <div class="empty-state">
      Carregando diagnósticos...
    </div>
  `;

  try {
    const response =
      await listarDiagnosticos(
        historyState
      );

    historyState.total =
      response.total;

    historyState.records =
      response.records.map(
        convertSupabaseRecord
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          historyState.total /
            historyState.pageSize
        )
      );

    if (
      historyState.page >
      totalPages
    ) {
      historyState.page =
        totalPages;

      return renderHistory();
    }

    renderHistoryRecords();
  } catch (error) {
    element(
      "historyList"
    ).innerHTML = `
      <div class="warning">
        Não foi possível carregar o histórico.
        <br><br>
        ${escapeHtml(error.message)}
      </div>
    `;

    element(
      "historyPagination"
    ).classList.add(
      "hidden"
    );

    setStatus(
      error.message ||
        "Erro ao carregar histórico.",
      "error"
    );
  }
}

function setReportPreviewMode(
  enabled
) {
  reportPreviewMode =
    enabled;

  const homeButton =
    element(
      "resultHomeBtn"
    );

  const editButton =
    element(
      "editResultBtn"
    );

  const downloadButton =
    element(
      "downloadJsonBtn"
    );

  const restartButton =
    element(
      "restartBtn"
    );

  const toolbarTitle =
    element(
      "reportToolbarTitle"
    );

  if (homeButton) {
    homeButton.textContent =
      enabled
        ? "Voltar para revisão"
        : "Início";
  }

  if (toolbarTitle) {
    toolbarTitle.textContent =
      enabled
        ? "Pré-visualização não salva"
        : "Diagnóstico de Segurança Digital";
  }

  [
    editButton,
    downloadButton,
    restartButton,
  ].forEach((button) => {
    button?.classList.toggle(
      "hidden",
      enabled
    );
  });
}

function getMissingQuestions() {
  const missing = [];

  CONFIG.sections.forEach(
    (section) => {
      section.questions.forEach(
        (question) => {
          if (
            !state.answers[
              question.id
            ]?.value
          ) {
            missing.push({
              section:
                section.name,

              question:
                question.text,
            });
          }
        }
      );
    }
  );

  return missing;
}

function validateDiagnosticForReport() {
  const errors = [];
  const warnings = [];

  const client =
    state.client || {};

  if (
    !String(
      client.companyName || ""
    ).trim()
  ) {
    errors.push(
      "Informe o nome da empresa."
    );
  }

  if (
    !String(
      client.contactName || ""
    ).trim()
  ) {
    errors.push(
      "Informe o nome do contato."
    );
  }

  if (
    !String(
      client.consultantName || ""
    ).trim()
  ) {
    errors.push(
      "Informe o consultor responsável."
    );
  }

  const email =
    String(
      client.contactEmail || ""
    ).trim();

  if (!email) {
    errors.push(
      "Informe o e-mail do contato."
    );
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    errors.push(
      "O e-mail do contato não é válido."
    );
  }

  const phone =
  String(
    client.contactPhone || ""
  ).trim();

  if (!phone) {
    errors.push(
      "Informe o telefone do contato."
    );
  }

  const employeeCount =
  String(
    client.employeeCount || ""
  ).trim();

  if (!employeeCount) {
    errors.push(
      "Selecione o número de colaboradores."
    );
  } else if (
    !EMPLOYEE_COUNT_OPTIONS.includes(
      employeeCount
    )
  ) {
    errors.push(
      "Selecione uma faixa válida de colaboradores."
    );
  }

  const segment =
  String(
    client.segment || ""
  ).trim();

  if (!segment) {
    errors.push(
      "Selecione o segmento da empresa."
    );
  } else if (
    !SEGMENT_OPTIONS.includes(
      segment
    )
  ) {
    errors.push(
      "Selecione um segmento válido."
    );
  }

  const missingQuestions =
    getMissingQuestions();

  if (missingQuestions.length) {
    errors.push(
      `${missingQuestions.length} pergunta(s) ainda estão sem resposta.`
    );
  }

  const unknownCount =
    Object.values(
      state.answers || {}
    ).filter(
      (answer) =>
        answer?.value ===
        "unknown"
    ).length;

  if (unknownCount) {
    warnings.push(
      `${unknownCount} resposta(s) foram marcadas como “Não sabe responder”.`
    );
  }

  if (
    !String(
      state.finalConsiderations ||
      ""
    ).trim()
  ) {
    errors.push(
      "Preencha ou gere as considerações finais."
    );
  }

  const approvalIds = [
    "reviewDataApproved",
    "reviewAnswersApproved",
    "reviewRecommendationsApproved",
    "reviewConsiderationsApproved",
  ];

  const pendingApprovals =
    approvalIds.filter(
      (id) =>
        !element(id)?.checked
    ).length;

  if (pendingApprovals) {
    errors.push(
      "Conclua o checklist de aprovação."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,
    warnings,
  };
}

function showDiagnosticValidation(
  validation
) {
  const warning =
    element("reviewWarning");

  if (!warning) {
    return;
  }

  const errors =
    Array.isArray(
      validation?.errors
    )
      ? validation.errors
      : [];

  const warnings =
    Array.isArray(
      validation?.warnings
    )
      ? validation.warnings
      : [];

  if (
    !errors.length &&
    !warnings.length
  ) {
    warning.innerHTML = "";

    warning.classList.add(
      "hidden"
    );

    warning.classList.remove(
      "review-warning-error",
      "review-warning-attention"
    );

    return;
  }

  const hasErrors =
    errors.length > 0;

  const messages = [
    ...errors.map(
      (message) => ({
        type: "error",
        message,
      })
    ),

    ...warnings.map(
      (message) => ({
        type: "warning",
        message,
      })
    ),
  ];

  warning.classList.remove(
    "hidden"
  );

  warning.classList.toggle(
    "review-warning-error",
    hasErrors
  );

  warning.classList.toggle(
    "review-warning-attention",
    !hasErrors
  );

  warning.innerHTML = `
    <strong class="review-warning-title">
      ${
        hasErrors
          ? "Corrija os itens abaixo antes de continuar"
          : "Atenção antes de finalizar"
      }
    </strong>

    <ul class="review-warning-list">
      ${messages
        .map(
          (item) => `
            <li>
              ${
                item.type ===
                "error"
                  ? "Erro:"
                  : "Aviso:"
              }

              ${escapeHtml(
                item.message
              )}
            </li>
          `
        )
        .join("")}
    </ul>
  `;

  if (hasErrors) {
    alert(
      "Revise o diagnóstico antes de continuar:\n\n" +
      errors
        .map(
          (message) =>
            `• ${message}`
        )
        .join("\n")
    );

    show("review");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }
}

function previewReport() {
  saveClient();

  const validation =
    validateDiagnosticForReport();

  showDiagnosticValidation(
    validation
  );

  if (!validation.valid) {
    return;
  }

  const result =
    buildResult();

  const now =
    new Date().toISOString();

  const previewRecord = {
    id:
      state.remoteRecordId ||
      null,

    completedAt:
      state.completedAt ||
      now,

    updatedAt:
      now,

    client: {
      ...state.client,
    },

    answers:
      structuredClone(
        state.answers || {}
      ),

    result,
  };

  renderStoredResult(
    previewRecord
  );

  setReportPreviewMode(
    true
  );

  show("result");

  setStatus(
    "Pré-visualização gerada. O diagnóstico ainda não foi salvo.",
    "info"
  );

  window.scrollTo(
    0,
    0
  );
}

async function generateResult() {
  saveClient();

  const validation =
    validateDiagnosticForReport();

  showDiagnosticValidation(
    validation
  );

  if (!validation.valid) {
    return;
  }

  const result =
    buildResult();

  const approvalDate =
    new Date().toISOString();

  result.approval = {
    status: "approved",

    approvedAt:
      approvalDate,

    approvedBy:
      String(
        state.client
          ?.consultantName ||
        ""
      ).trim(),
  };

  const button =
    element("generateBtn");

  const isEditing =
    Boolean(
      state.remoteRecordId
    );

  button.disabled = true;

  button.textContent =
    isEditing
      ? "Atualizando..."
      : "Salvando...";

  setStatus(
    isEditing
      ? "Atualizando diagnóstico..."
      : "Salvando diagnóstico...",
    "info"
  );

  try {
    const saved =
      isEditing
        ? await atualizarDiagnostico({
            id:
              state.remoteRecordId,
            client:
              state.client,
            answers:
              state.answers,
            result,
          })
        : await salvarDiagnostico({
            client:
              state.client,
            answers:
              state.answers,
            result,
          });

    state.remoteRecordId =
      saved.id;

    state.lastResult =
      result;

    state.completedAt =
      saved.created_at ||
      state.completedAt ||
      new Date().toISOString();

    saveState();

    const record =
      convertSupabaseRecord(
        saved
      );

    renderStoredResult(
      record
    );

    setReportPreviewMode(
      false
    );

    show("result");

    setStatus(
      isEditing
        ? "Diagnóstico atualizado no Supabase."
        : "Diagnóstico salvo no Supabase.",
      "success"
    );

    window.scrollTo(0, 0);
  } catch (error) {
    setStatus(
      error.message ||
        "O diagnóstico não foi salvo.",
      "error"
    );

    alert(
      `Não foi possível salvar o diagnóstico.\n\n${error.message}`
    );
  } finally {
    button.disabled = false;
    button.textContent =
      "Gerar diagnóstico";
  }
}

function startNewDiagnostic() {
  if (
    hasSavedProgress() &&
    !confirm(
      "Existe um rascunho salvo. Deseja apagá-lo e iniciar um novo diagnóstico?"
    )
  ) {
    return;
  }

  clearState();
  show("questions");
  renderSection();
  window.scrollTo(0, 0);
}

function continueSavedDiagnostic() {
  loadState();
  fillClientForm();

  const totalQuestions =
    CONFIG.sections.reduce(
      (sum, section) =>
        sum +
        section.questions.length,
      0
    );

  if (
    Object.keys(
      state.answers
    ).length >=
      totalQuestions &&
    state.client.companyName
  ) {
    renderReview();
    show("review");
  } else {
    show("questions");
    renderSection();
  }

  window.scrollTo(0, 0);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const char =
      text[index];

    if (char === '"') {
      if (
        quoted &&
        text[index + 1] === '"'
      ) {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (
      char === "," &&
      !quoted
    ) {
      row.push(field);
      field = "";
    } else if (
      (
        char === "\n" ||
        char === "\r"
      ) &&
      !quoted
    ) {
      if (
        char === "\r" &&
        text[index + 1] === "\n"
      ) {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (
    field ||
    row.length
  ) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function findQuestionByText(
  text
) {
  const normalized =
    normalizeText(text);

  for (
    const section
    of CONFIG.sections
  ) {
    for (
      const question
      of section.questions
    ) {
      if (
        [
          question.text,
          ...(
            question.aliases ||
            []
          ),
        ].some(
          (value) =>
            normalizeText(
              value
            ) === normalized
        )
      ) {
        return question;
      }
    }
  }

  return null;
}

function importRows(rows) {
  clearState();

  let matched = 0;

  for (const row of rows) {
    const first =
      String(
        row[0] || ""
      ).trim();

    const normalized =
      normalizeText(first);

    if (
      normalized ===
      "nome da empresa"
    ) {
      state.client.companyName =
        String(
          row[1] || ""
        ).trim();
    } else if (
      normalized ===
      "contato"
    ) {
      state.client.contactName =
        String(
          row[1] || ""
        ).trim();
    } else if (
      normalized.includes(
        "numero colaboradores"
      )
    ) {
      state.client.employeeCount =
        String(
          row[1] || ""
        ).trim();
    }

    const question =
      findQuestionByText(
        first
      );

    if (!question) {
      continue;
    }

    let value = null;

    if (
      Number(
        String(
          row[1] || ""
        ).replace(",", ".")
      ) === 100
    ) {
      value = "yes";
    } else if (
      Number(
        String(
          row[2] || ""
        ).replace(",", ".")
      ) === 50
    ) {
      value = "partial";
    } else if (
      Number(
        String(
          row[3] || ""
        ).replace(",", ".")
      ) === 0 &&
      String(
        row[3] || ""
      ).trim() !== ""
    ) {
      value = "no";
    } else {
      const result =
        Number(
          String(
            row[4] || ""
          ).replace(",", ".")
        );

      if (result === 100) {
        value = "yes";
      } else if (
        result === 50
      ) {
        value = "partial";
      } else if (
        result === 0
      ) {
        value = "no";
      }
    }

    if (value) {
      state.answers[
        question.id
      ] = {
        value,

        observation:
          String(
            row[5] || ""
          ).trim(),
      };

      matched += 1;
    }
  }

  state.sectionIndex = 0;
  saveState();
  fillClientForm();

  return matched;
}

async function handleCSV(file) {
  const status =
    element("importStatus");

  try {
    status.textContent =
      "Lendo a planilha...";

    const buffer =
      await file.arrayBuffer();

    let content =
      new TextDecoder(
        "utf-8",
        {
          fatal: false,
        }
      ).decode(buffer);

    if (
      (
        content.match(
          /�/g
        ) || []
      ).length > 2
    ) {
      content =
        new TextDecoder(
          "windows-1252"
        ).decode(buffer);
    }

    const matched =
      importRows(
        parseCSV(content)
      );

    if (!matched) {
      throw new Error(
        "Nenhuma das 21 perguntas foi reconhecida. Use o modelo atual da planilha."
      );
    }

    status.textContent =
      `Importação concluída: ${matched} pergunta(s) reconhecida(s).`;

    renderReview();
    show("review");
    window.scrollTo(0, 0);
  } catch (error) {
    status.textContent =
      `Erro: ${error.message}`;

    alert(
      `Não foi possível importar a planilha. ${error.message}`
    );
  }
}

function downloadCurrentJson() {
  const payload = {
    exportedAt:
      new Date().toISOString(),

    diagnostic:
      state,
  };

  const blob =
    new Blob(
      [
        JSON.stringify(
          payload,
          null,
          2
        ),
      ],
      {
        type:
          "application/json",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href = url;

  anchor.download =
    `diagnostico-${(state.client.companyName || "cliente")
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )}.json`;

  anchor.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    500
  );
}

function bindEvents() {
  element(
    "startBtn"
  ).addEventListener(
    "click",
    startNewDiagnostic
  );

  element(
    "continueBtn"
  ).addEventListener(
    "click",
    continueSavedDiagnostic
  );

  element(
    "historyBtn"
  ).addEventListener(
    "click",
    async () => {
      historyState.page = 1;

      show("history");
      window.scrollTo(0, 0);

      await renderHistory();
    }
  );

  element(
    "historyBackBtn"
  ).addEventListener(
    "click",
    () => {
      show("home");
      updateContinueButton();
    }
  );

  element(
    "importBtn"
  ).addEventListener(
    "click",
    () =>
      element(
        "csvInput"
      ).click()
  );

  element(
    "csvInput"
  ).addEventListener(
    "change",
    (event) => {
      const file =
        event.target.files[0];

      if (file) {
        handleCSV(file);
      }

      event.target.value =
        "";
    }
  );

  element(
    "prevBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        state.sectionIndex >
        0
      ) {
        state.sectionIndex -= 1;
        saveState();
        renderSection();
        window.scrollTo(0, 0);
      }
    }
  );

  element(
    "nextBtn"
  ).addEventListener(
    "click",
    () => {
      const section =
        CONFIG.sections[
          state.sectionIndex
        ];

      const missing =
        sectionMissing(
          section
        );

      if (
        missing.length &&
        !confirm(
          `Há ${missing.length} pergunta(s) sem resposta. Deseja continuar mesmo assim?`
        )
      ) {
        return;
      }

      if (
        state.sectionIndex <
        CONFIG.sections.length -
          1
      ) {
        state.sectionIndex += 1;
        saveState();
        renderSection();
      } else {
        fillClientForm();
        show("client");
      }

      window.scrollTo(0, 0);
    }
  );

  element(
    "clientBackBtn"
  ).addEventListener(
    "click",
    () => {
      saveClient();

      state.sectionIndex =
        CONFIG.sections.length -
        1;

      saveState();
      show("questions");
      renderSection();
    }
  );

  element(
    "reviewBtn"
  ).addEventListener(
    "click",
    () => {
      saveClient();

      if (
        !state.client.companyName ||
        !state.client.contactName
      ) {
        alert(
          "Preencha o nome da empresa e o nome do contato."
        );

        return;
      }

      renderReview();
      show("review");
      window.scrollTo(0, 0);
    }
  );

  element(
    "reviewBackBtn"
  )?.addEventListener(
    "click",
    () => {
      fillClientForm();
      show("client");
      window.scrollTo(0, 0);
    }
  );

  element(
    "reviewEditClientBtn"
  )?.addEventListener(
    "click",
    () => {
      fillClientForm();
      show("client");
      window.scrollTo(0, 0);
    }
  );

  [
    "reviewDataApproved",
    "reviewAnswersApproved",
    "reviewRecommendationsApproved",
    "reviewConsiderationsApproved",
  ].forEach((id) => {
    element(id)
      ?.addEventListener(
        "change",
        updateReviewApproval
      );
  });

  element(
    "reviewFinalConsiderations"
  )?.addEventListener(
    "input",
    (event) => {
      state.finalConsiderations =
        event.target.value;

      saveState();
      updateReviewApproval();
    }
  );

  element(
    "reviewRecommendationsAiBtn"
  )?.addEventListener(
    "click",
    reviewRecommendationsWithAi
  );

  element(
    "reviewFinalConsiderationsAiBtn"
  )?.addEventListener(
    "click",
    generateFinalConsiderationsWithAi
  );

  element(
    "reportPreviewBtn"
  )?.addEventListener(
    "click",
    previewReport
  );

  element(
    "generateBtn"
  ).addEventListener(
    "click",
    generateResult
  );

  element(
    "resultHomeBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        reportPreviewMode
      ) {
        setReportPreviewMode(
          false
        );

        show("review");

        setStatus(
          "Você voltou para a revisão. Nenhuma alteração foi salva no Supabase.",
          "info"
        );

        window.scrollTo(
          0,
          0
        );

        return;
      }

      show("home");
      updateContinueButton();

      window.scrollTo(
        0,
        0
      );
    }
  );

  element(
    "editResultBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        !state.remoteRecordId
      ) {
        return;
      }

      fillClientForm();
      state.sectionIndex = 0;
      renderSection();
      show("questions");

      setStatus(
        `Editando diagnóstico de ${state.client.companyName || "cliente"}.`,
        "info"
      );
    }
  );

  element(
    "downloadJsonBtn"
  ).addEventListener(
    "click",
    downloadCurrentJson
  );

  element(
    "printBtn"
  ).addEventListener(
    "click",
    () => printReport()
  );

  element(
    "restartBtn"
  ).addEventListener(
    "click",
    () => {
      if (
        !confirm(
          "Deseja iniciar um novo diagnóstico? O resultado atual continuará salvo no histórico."
        )
      ) {
        return;
      }

      clearState();
      show("questions");
      renderSection();
    }
  );

  element(
    "historySearch"
  ).addEventListener(
    "input",
    (event) => {
      clearTimeout(
        historySearchTimer
      );

      historySearchTimer =
        setTimeout(
          async () => {
            historyState.search =
              event.target.value.trim();

            historyState.page = 1;

            await renderHistory();
          },
          300
        );
    }
  );

  element(
    "historyMaturity"
  ).addEventListener(
    "change",
    async (event) => {
      historyState.maturity =
        event.target.value;

      historyState.page = 1;

      await renderHistory();
    }
  );

  element(
    "clearHistoryFiltersBtn"
  ).addEventListener(
    "click",
    async () => {
      element(
        "historySearch"
      ).value = "";

      element(
        "historyMaturity"
      ).value = "";

      historyState.search = "";
      historyState.maturity = "";
      historyState.page = 1;

      await renderHistory();
    }
  );

  element(
    "historyPrevPage"
  ).addEventListener(
    "click",
    async () => {
      if (
        historyState.page <= 1
      ) {
        return;
      }

      historyState.page -= 1;

      await renderHistory();
      window.scrollTo(0, 0);
    }
  );

  element(
    "historyNextPage"
  ).addEventListener(
    "click",
    async () => {
      const totalPages =
        Math.max(
          1,
          Math.ceil(
            historyState.total /
              historyState.pageSize
          )
        );

      if (
        historyState.page >=
        totalPages
      ) {
        return;
      }

      historyState.page += 1;

      await renderHistory();
      window.scrollTo(0, 0);
    }
  );

  window.addEventListener(
    "stmgo:signed-out",
    () => {
      state = emptyState();

      historyState = {
        page: 1,
        pageSize: PAGE_SIZE,
        search: "",
        maturity: "",
        total: 0,
        records: [],
      };
    }
  );
}

loadState();
fillClientForm();
updateContinueButton();
bindEvents();