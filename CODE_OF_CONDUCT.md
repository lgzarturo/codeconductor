# Code of Conduct and Content Usage

## Part 1 — Community Code of Conduct

### Our Pledge

We as contributors and maintainers pledge to make participation in CodeConductor
a harassment-free experience for everyone, regardless of age, body size, visible
or invisible disability, ethnicity, sex characteristics, gender identity and
expression, level of experience, education, socio-economic status, nationality,
personal appearance, race, caste, color, religion, or sexual identity and
orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

### Our Standards

**Positive behaviors:**

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Giving and gracefully accepting constructive feedback
- Focusing on what is best for the community
- Showing empathy toward other community members

**Unacceptable behaviors:**

- Sexualized language or imagery, and unwelcome sexual attention or advances
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a
  professional setting

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported by opening a private security advisory or contacting the maintainer
directly. All complaints will be reviewed promptly and confidentially.

Maintainers who do not follow or enforce this Code of Conduct in good faith may
face temporary or permanent repercussions as determined by the project
leadership.

This Code of Conduct is adapted from the
[Contributor Covenant](https://www.contributor-covenant.org), version 2.1.

---

## Part 2 — Content Usage

CodeConductor ships documentation, declarative policies, agent contracts,
workflow templates, and skill files. This section clarifies how that content may
be used.

### License

All content in this repository is released under the [MIT License](./LICENSE).
You are free to use, copy, modify, merge, publish, distribute, sublicense, and
sell copies — provided the copyright notice and license text are included in all
distributions.

### Presets and Templates

The files under `presets/` are ready-to-install configurations for supported AI
coding tools (Claude Code, OpenCode, Codex CLI). You may:

- Copy them into your own projects unchanged
- Adapt them to your team's conventions
- Redistribute adapted versions, provided attribution is preserved

### Skill Files

`SKILL.md` files define reusable agent knowledge. You may:

- Use them as-is in any project
- Extend or replace individual skills
- Publish custom skill sets based on this format

Attribution is appreciated but not required.

### Agent Contracts and Workflow Templates

Role definitions, routing policies, and workflow templates may be used and
modified freely. If you publish a derived framework, a reference to
CodeConductor in your README is welcome.

### What Is Not Permitted

- Removing the MIT License copyright notice from redistributed copies
- Representing unmodified CodeConductor content as your own original work
- Using the CodeConductor name or logo to imply official endorsement of a
  derivative project without permission

### No Warranty

Content is provided "as is," without warranty of any kind. Enforcement of
policies defined in CodeConductor presets depends entirely on the target tool.
See [docs/current-limitations.md](./docs/current-limitations.md) for an honest
account of what the framework does and does not do today.
