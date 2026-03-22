function isTestFile(filename) {
  return /(?:^|[\\/])(?:tests?|__tests__)(?:[\\/]|$)|(?:^|[\\/]).*\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(
    filename
  );
}

function hasDisallowedToken(value, tokenPrefix, allowList) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  if (!value.includes(tokenPrefix)) {
    return false;
  }
  return !allowList.some((allowed) => value.includes(allowed));
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow hardcoded Askr theme tokens in JavaScript/TypeScript source strings',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          tokenPrefix: { type: 'string' },
          allowInTests: { type: 'boolean' },
          allowList: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hardcodedToken:
        'Avoid hardcoding theme token "{{tokenPrefix}}" in runtime code. Prefer component slots/state hooks and theme CSS.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const tokenPrefix = options.tokenPrefix ?? '--ak-';
    const allowInTests = options.allowInTests ?? true;
    const allowList = options.allowList ?? [];
    const filename = context.filename ?? context.getFilename?.() ?? '';

    if (allowInTests && isTestFile(filename)) {
      return {};
    }

    function reportIfNeeded(node, value) {
      if (!hasDisallowedToken(value, tokenPrefix, allowList)) {
        return;
      }
      context.report({
        node,
        messageId: 'hardcodedToken',
        data: { tokenPrefix },
      });
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          reportIfNeeded(node, node.value);
        }
      },
      TemplateElement(node) {
        reportIfNeeded(node, node.value?.cooked ?? '');
      },
    };
  },
};
