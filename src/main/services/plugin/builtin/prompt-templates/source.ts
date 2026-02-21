export const source = `"use strict";

const TEMPLATES = [
  {
    id: "translate",
    command: "prompt-templates.translate",
    name: "Translate",
    description: "Translate text to a specified language",
    template: "Please translate the following text to {{language}}:\\n\\n{{text}}"
  },
  {
    id: "summarize",
    command: "prompt-templates.summarize",
    name: "Summarize",
    description: "Summarize content concisely",
    template: "Please summarize the following content in a concise manner, highlighting the key points:\\n\\n{{text}}"
  },
  {
    id: "codeReview",
    command: "prompt-templates.codeReview",
    name: "Code Review",
    description: "Review code for issues and improvements",
    template: "Please review the following code. Point out any bugs, security issues, performance problems, and suggest improvements:\\n\\n\\\`\\\`\\\`\\n{{code}}\\n\\\`\\\`\\\`"
  },
  {
    id: "explain",
    command: "prompt-templates.explain",
    name: "Explain",
    description: "Explain a concept or code in simple terms",
    template: "Please explain the following in simple, easy-to-understand terms:\\n\\n{{text}}"
  },
  {
    id: "fixGrammar",
    command: "prompt-templates.fixGrammar",
    name: "Fix Grammar",
    description: "Fix grammar and spelling errors",
    template: "Please fix any grammar, spelling, and punctuation errors in the following text. Only return the corrected text without explanations:\\n\\n{{text}}"
  },
  {
    id: "writeEmail",
    command: "prompt-templates.writeEmail",
    name: "Write Email",
    description: "Draft a professional email",
    template: "Please write a professional email with the following details:\\n\\nRecipient: {{recipient}}\\nSubject: {{subject}}\\nKey points: {{points}}"
  },
  {
    id: "brainstorm",
    command: "prompt-templates.brainstorm",
    name: "Brainstorm",
    description: "Brainstorm ideas on a topic",
    template: "Please brainstorm 10 creative ideas about the following topic. For each idea, provide a brief description:\\n\\nTopic: {{topic}}"
  },
  {
    id: "refactorCode",
    command: "prompt-templates.refactorCode",
    name: "Refactor Code",
    description: "Refactor code for better quality",
    template: "Please refactor the following code to improve readability, maintainability, and performance. Explain the changes you made:\\n\\n\\\`\\\`\\\`\\n{{code}}\\n\\\`\\\`\\\`"
  }
];

module.exports = {
  activate(context) {
    console.log("[Prompt Templates] Activating...");

    // Register list command
    context.commands.registerCommand("prompt-templates.list", function() {
      return TEMPLATES.map(function(t) {
        return { id: t.id, name: t.name, description: t.description, template: t.template };
      });
    });

    // Register individual template commands
    TEMPLATES.forEach(function(tmpl) {
      context.commands.registerCommand(tmpl.command, function() {
        return { id: tmpl.id, name: tmpl.name, description: tmpl.description, template: tmpl.template };
      });
    });

    console.log("[Prompt Templates] Activated with " + TEMPLATES.length + " templates");
  },
  deactivate() {
    console.log("[Prompt Templates] Deactivated");
  }
};
`;
