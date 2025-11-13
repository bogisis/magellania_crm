# Documentation Templates

> **Consistent templates for creating new documentation**

---

## 📋 Overview

This directory contains reusable templates for creating consistent documentation across the Quote Calculator project.

**Purpose:** Maintain uniformity in documentation structure and ensure all necessary sections are covered.

---

## 📁 Available Templates

### 1. [feature-template.md](feature-template.md)

**Use for:** Documenting individual features or functionality

**When to use:**
- New feature implementation
- Explaining existing features
- Feature guides for users or developers

**Sections included:**
- Overview and use cases
- Step-by-step usage guide
- Examples and configuration
- Technical details
- Troubleshooting
- Best practices

---

### 2. [api-endpoint-template.md](api-endpoint-template.md)

**Use for:** REST API endpoint documentation

**When to use:**
- Documenting new API endpoints
- Creating comprehensive API reference
- Backend API documentation

**Sections included:**
- Request format (headers, params, body)
- Response format (success and errors)
- Examples with curl commands
- Implementation details
- Validation rules
- Security considerations
- Testing examples

---

### 3. [tutorial-template.md](tutorial-template.md)

**Use for:** Step-by-step tutorials and how-to guides

**When to use:**
- Creating user tutorials
- Writing developer guides
- How-to documentation
- Getting started guides

**Sections included:**
- Prerequisites and requirements
- Step-by-step instructions with checkpoints
- Testing and verification
- Customization options
- Common mistakes to avoid
- Troubleshooting
- Next steps

---

## 🚀 How to Use Templates

### Step 1: Choose the Right Template

Match your documentation need to a template:
- **Feature docs** → feature-template.md
- **API docs** → api-endpoint-template.md
- **Tutorials** → tutorial-template.md

---

### Step 2: Copy the Template

```bash
# Copy to your target location
cp docs/_templates/feature-template.md docs/ru/developer-guide/features/my-feature.md
```

---

### Step 3: Fill in the Content

1. **Replace placeholders:**
   - `[Feature Name]` → Actual feature name
   - `[Description]` → Your content
   - All `[bracketed]` content

2. **Remove sections that don't apply:**
   - Not all sections are mandatory
   - Keep what makes sense for your doc

3. **Customize as needed:**
   - Add sections if needed
   - Adjust structure for specific use case

4. **Add real examples:**
   - Replace generic examples with real code
   - Use actual data from the project

---

### Step 4: Review Checklist

Before finalizing your documentation:

- [ ] All placeholders replaced with real content
- [ ] Code examples tested and working
- [ ] Links to related docs added
- [ ] Images/screenshots added (if applicable)
- [ ] Grammar and spelling checked
- [ ] Consistent with project terminology
- [ ] Navigation links work correctly

---

## 📝 Template Customization

### When to Customize

Templates are starting points. Feel free to:
- ✅ Add sections specific to your needs
- ✅ Remove sections that don't apply
- ✅ Adjust structure for clarity
- ✅ Combine templates if needed

### When NOT to Customize

Don't skip these critical sections:
- ❌ Overview/Purpose (users need context)
- ❌ Examples (practical usage is key)
- ❌ Troubleshooting (help users solve problems)
- ❌ Related docs (navigation is important)

---

## 🎨 Writing Style Guide

### General Principles

1. **Be clear and concise**
   - Use simple language
   - Avoid jargon when possible
   - Explain technical terms

2. **Be actionable**
   - Use imperative mood ("Click Save", not "You should click Save")
   - Provide concrete steps
   - Include verification steps

3. **Be helpful**
   - Anticipate questions
   - Address common mistakes
   - Provide troubleshooting

4. **Be consistent**
   - Use same terminology across docs
   - Follow template structure
   - Maintain consistent formatting

---

### Formatting Conventions

**Headings:**
```markdown
# H1 - Page Title
## H2 - Main Sections
### H3 - Subsections
#### H4 - Details (use sparingly)
```

**Code blocks:**
```markdown
```javascript
// Always specify language for syntax highlighting
const example = 'value';
` ``
```

**Emphasis:**
- `**Bold**` for important concepts
- `*Italic*` for emphasis or terms
- `` `Code` `` for code, filenames, commands

**Lists:**
- Use `-` for unordered lists
- Use `1.` for ordered lists (numbered)
- Use `- [ ]` for checklists

**Admonitions:**
```markdown
> **Note:** Information
> **Warning:** Caution
> **Tip:** Helpful hint
```

---

## 🔗 Related Documentation

**MkDocs Material features:**
- [Admonitions](https://squidfunk.github.io/mkdocs-material/reference/admonitions/)
- [Code blocks](https://squidfunk.github.io/mkdocs-material/reference/code-blocks/)
- [Content tabs](https://squidfunk.github.io/mkdocs-material/reference/content-tabs/)

**Our documentation:**
- [Main documentation](../../index.md)
- [Developer guide](../ru/developer-guide/index.md)
- [User guide](../ru/user-guide/index.md)

---

## 💬 Feedback

**Found an issue with templates?**
- Create an issue on GitHub
- Suggest improvements
- Share your customizations

**Want to add a new template?**
1. Create the template file here
2. Document it in this README
3. Submit a PR

---

## 📊 Template Maintenance

**Last updated:** 2025-11-05
**Version:** 1.0.0
**Maintained by:** Documentation Team

**Change history:**
- v1.0.0 (2025-11-05) - Initial template collection
  - feature-template.md
  - api-endpoint-template.md
  - tutorial-template.md
