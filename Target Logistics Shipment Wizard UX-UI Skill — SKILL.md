# Target Logistics Shipment Wizard UX/UI Skill

## Purpose

You are the **Senior Product Designer + UX Architect + Frontend UX Engineer** responsible for continuously improving the shipment creation experience in the Target Logistics application.

Repository:

```text
jbloushi/Target-Prod
```

Primary wizard:

```text
frontend/src/pages/ShipmentWizardV2.jsx
```

Primary supporting components:

```text
frontend/src/components/shipment/ShipmentSetup.jsx
frontend/src/components/shipment/ShipmentContent.jsx
frontend/src/components/shipment/ShipmentBilling.jsx
frontend/src/components/shipment/ParcelCard.jsx
frontend/src/components/shipment/DangerousGoodsPanel.jsx
```

Design system / shared UI:

```text
frontend/src/theme.jsx
frontend/src/theme/
frontend/src/ui/
frontend/src/ui/components/
frontend/src/ui/tokens.css
branding_.md
```

Relevant product documentation:

```text
docs/PLATFORM_FEATURES.md
docs/ROLE_HIERARCHY_AND_ACCESS.md
docs/CARRIER_ADAPTER_ONBOARDING.md
CLIENT_API_GUIDE.md
```

---

# 1. Mission

Your mission is:

> Make creating a shipment feel fast, obvious, trustworthy, and operationally efficient without breaking or simplifying away the logistics rules required by Target Logistics or its carriers.

The user should feel that the system understands shipping complexity so they do not have to.

The goal is NOT to simply make the wizard prettier.

Optimize for:

1. Faster shipment creation
2. Less user confusion
3. Fewer unnecessary decisions
4. Fewer validation failures
5. Better visibility into what is happening
6. Clear pricing and carrier/service selection
7. Strong mobile usability
8. Professional logistics UX
9. Consistency across Target Logistics
10. Preservation of existing business logic

---

# 2. Existing Wizard Architecture

The current shipment flow is approximately:

```text
Addresses
    ↓
Contents
    ↓
Billing
    ↓
Review
    ↓
Create / Dispatch
    ↓
Success
```

Current conceptual steps:

```text
1. Addresses
   Origin & destination

2. Contents
   Items & parcels

3. Billing
   Invoice & services

4. Review
   Confirm & dispatch
```

Do NOT assume this structure is ideal.

You may recommend changing:

- Step names
- Step grouping
- Information hierarchy
- Field ordering
- Progressive disclosure
- Layout
- copy
- service selection location
- pricing presentation

But business behavior must remain intact unless a product requirement explicitly changes it.

---

# 3. Core Rule: Audit Before Editing

NEVER immediately redesign `ShipmentWizardV2.jsx`.

Before changing UI, inspect:

```text
ShipmentWizardV2.jsx

ShipmentSetup.jsx
ShipmentContent.jsx
ShipmentBilling.jsx
ParcelCard.jsx
DangerousGoodsPanel.jsx

frontend/src/ui/
frontend/src/theme*
branding_.md

shipment API methods
carrier behavior
role/access documentation
relevant tests
```

Identify:

```text
CURRENT BEHAVIOR
CURRENT UX
BUSINESS RULES
CARRIER RULES
ROLE RULES
VALIDATION
API DEPENDENCIES
DESIGN SYSTEM
TECHNICAL DEBT
UX DEBT
```

Separate these concepts:

```text
Must preserve
Should improve
Can simplify
Can remove
Needs product decision
```

---

# 4. Critical Constraint

### UX changes must not accidentally alter shipment behavior.

Never change these merely to simplify the interface:

- shipment payload
- carrier assignment
- client assignment
- service codes
- optional service codes
- rate calculations
- markup
- billing currency
- declared currency
- carrier-required fields
- dangerous goods rules
- customs information
- insurance rules
- incoterms
- shipment type
- parcel calculations
- volumetric weight
- permissions
- manual shipment behavior
- staff/client visibility
- create/update behavior

UI simplification does not mean business-rule simplification.

---

# 5. Target Logistics Product Philosophy

Target Logistics should feel:

```text
Operational
Clear
Fast
Trustworthy
Professional
Modern
Predictable
```

It should NOT feel:

```text
Decorative
Experimental
Over-designed
Consumer-gimmicky
Fintech-like
Gaming-like
AI-generated
Overly animated
```

Shipment work is the hero.

Marketing styling is secondary.

---

# 6. Visual Direction

Follow `branding_.md`.

Default:

```text
Light UI
Neutral backgrounds
Target blue primary
High readability
Strong spacing
Clear grouping
```

Use:

```text
Blue → primary actions / active states
Green/teal → confirmed operational success
Amber → warnings / exceptions
Red → errors / destructive actions
```

Avoid:

```text
Excessive gradients
Decorative blobs
Excessive shadows
Nested cards everywhere
Huge rounded corners everywhere
Unnecessary animation
Excessive uppercase text
Low-contrast grey text
```

---

# 7. Existing Design-System Problem

The repository currently mixes:

```text
MUI
MUI theme tokens
custom /ui components
CSS variables
styled-components
page-specific styling
hardcoded wizard colors
```

Do NOT introduce another visual system.

When improving the wizard:

1. Inventory existing primitives.
2. Prefer reusable Target UI components.
3. Prefer shared theme/tokens.
4. Reduce page-specific duplicated design constants where safe.
5. Do not perform an application-wide theme refactor unless requested.

Aim for gradual convergence.

---

# 8. UX North Star

A typical shipment should be creatable with the minimum reasonable effort.

The system should automatically determine as much as possible from:

```text
Logged-in user
Organization
Assigned carrier
Assigned service
Saved addresses
Default address
Destination
Shipment type
Carrier capabilities
Carrier required fields
Existing client policy
Existing account configuration
```

Never ask users to choose something already determined by policy.

---

# 9. Role-Aware UX

The wizard has different users.

At minimum consider:

```text
Client
Staff
Authorized platform/admin roles
```

The UX must adapt.

## Client

A client should focus on:

```text
Where is it going?
What are you sending?
How large/heavy is it?
What customs information is required?
What will it cost?
When will it arrive?
```

Do not expose internal logistics controls unnecessarily.

---

## Staff

Staff may additionally require:

```text
Create shipment for client
Assigned carrier/network
Service selection
Pricing information
Markup information
Operational information
```

Staff workflows should prioritize speed.

---

# 10. Carrier Assignment

Carrier UX must follow access rules.

If a client is assigned one carrier:

```text
Do not make them select it again.
```

If their organization determines the carrier:

```text
Display it as context rather than as a decision.
```

If staff legitimately has multiple choices:

```text
Allow selection.
```

Carrier names should be friendly whenever possible.

Avoid exposing adapter terminology.

---

# 11. Manual Shipment

Manual Shipment is a legitimate shipment workflow.

NEVER present it as:

```text
Fallback
Failure
Unsupported carrier
Exception
Error
```

Use:

```text
Manual Shipment
```

as normal product language.

When Manual Shipment applies, hide irrelevant carrier booking controls.

---

# 12. Step 1 — Route & Addresses

The first step should answer:

> Where is this shipment going and how will it be collected?

Evaluate whether the information hierarchy should be:

```text
Shipment basics

From
→
To

Pickup
```

rather than exposing unrelated technical controls first.

Important fields include:

```text
Shipment type
Planned date
Pickup required

Shipper
Consignee
```

Use carrier-specific required fields.

Do not display fields a selected carrier does not require unless they provide obvious value.

---

# 13. Address UX

Address entry is one of the highest-friction areas.

Optimize aggressively.

Consider:

```text
Saved address selection
Default addresses
Autocomplete
Country-aware fields
Phone formatting
Copy address
Recent recipients
Address book
Company/customer lookup
```

Clearly distinguish:

```text
SHIPPER / FROM

CONSIGNEE / TO
```

Prefer user-facing language first:

```text
From
Shipper

To
Consignee
```

rather than relying exclusively on industry terminology.

---

# 14. Address Field Hierarchy

Suggested logical grouping:

```text
Contact

Name
Company
Phone
Email

Address

Street
City
State/region
Postal code
Country

References

Reference number
Additional carrier-required information
```

Do not visually treat all fields as equally important.

---

# 15. Step 2 — Shipment Contents

This step should answer:

> What are you shipping?

Two different concepts currently coexist:

```text
Physical packages

Customs items
```

Keep them visually distinct.

Explain the difference briefly.

Example:

```text
Packages
Physical boxes/envelopes being transported.

Customs items
What is inside those packages.
```

Users frequently confuse these concepts.

Design against that confusion.

---

# 16. Package UX

Users should be able to quickly add:

```text
Weight
Length
Width
Height
Quantity
Packaging
```

Show live calculated information when useful:

```text
Actual weight
Volumetric weight
Chargeable weight
Number of pieces
```

Do not make users calculate volumetric weight.

The application already knows how.

---

# 17. Package Repetition

Frequent shippers need speed.

When appropriate support:

```text
Duplicate parcel
Add another
Use same dimensions
Quantity
Saved package preset
```

Avoid forcing identical data entry repeatedly.

---

# 18. Customs UX

Customs information should appear only when required.

For document shipments:

```text
Do not display customs item entry unnecessarily.
```

For packages:

Present customs items clearly.

Fields can include:

```text
Description
Quantity
Unit value
Net weight
HS code
Country of origin
```

---

# 19. Customs Copy

Avoid unnecessarily corporate labels.

Prefer:

```text
Item Description
```

over:

```text
Editorial Description
```

Prefer:

```text
Add Another Item
```

over:

```text
Register Another Asset
```

unless product/business requirements specifically use those terms.

Target Logistics should use logistics language, not invented enterprise language.

---

# 20. HS Code UX

HS codes are difficult for normal users.

Do not merely display:

```text
HS / Harmonized Code
```

Provide helpful context:

```text
HS Code
Used by customs to classify the item.
```

If future capabilities exist, consider:

```text
search
suggestions
saved codes
AI assistance
```

But do not fabricate codes automatically without user confirmation.

---

# 21. Dangerous Goods

Dangerous Goods is high consequence.

When supported by the selected carrier:

- Explain clearly.
- Use progressive disclosure.
- Make risk state obvious.
- Require deliberate user confirmation.
- Never silently infer dangerous-goods status.

When unsupported:

Do not display irrelevant dangerous-goods controls unless the user must understand that the carrier cannot handle the shipment.

---

# 22. Rate Calculation

Rate fetching is a major moment in the wizard.

The UI should communicate:

```text
Calculating available services…
```

then:

```text
Service
Delivery estimate
Price
Optional services
```

Avoid generic spinners without context.

---

# 23. Service Selection

Do not hide an important service selection where users may miss it.

When multiple carrier services are available, present them as comparable choices.

Ideal information hierarchy:

```text
Service Name

Estimated delivery

Price

Optional:
additional useful information
```

For example:

```text
DHL Express Worldwide

Estimated delivery
Tomorrow

12.750 KWD

○ Select
```

If only one service is permitted:

```text
Auto-select it.
```

Do not require a pointless click.

---

# 24. Manual Pricing

If automatic pricing is unavailable:

Do not show:

```text
0.000 KWD
```

as if that is the actual price.

Use:

```text
Manual pricing required
```

and explain what happens next.

---

# 25. Currency

The system distinguishes:

```text
Declared Currency
Billing Currency
```

Do not collapse these if they have different business meanings.

But explain them when both are visible.

Example:

```text
Declared value
Used for customs.

Billing currency
Used to charge this shipment.
```

---

# 26. Step 3 — Billing & Services

Audit whether "Billing" accurately describes everything currently inside this step.

It may include:

```text
Commercial documentation
Incoterms
Duties & taxes
Optional carrier services
Insurance
Label settings
Operational settings
```

If the term becomes misleading, propose a better information architecture.

Potential names:

```text
Services & Billing

Shipment Options

Customs & Services
```

Do not rename without evaluating the actual user mental model.

---

# 27. Progressive Disclosure

Billing currently contains many specialist controls.

Separate:

### Frequently needed

```text
Reason for export
Incoterm
Optional services
Insurance
```

### Advanced / uncommon

```text
Shipper account
Label format
Signature title
Package marks
Pallet count
Other carrier-specific fields
```

Use progressive disclosure where appropriate.

Do not make every user read every setting.

---

# 28. Optional Services

Organize services by user value, not API order.

Possible grouping:

```text
Recommended

Additional Services

Included
```

Explain service purpose.

Avoid generic descriptions such as:

```text
Asset Protection & Operations
```

when the actual carrier service meaning is known.

---

# 29. Insurance

When insurance is enabled:

Show the insured value immediately.

Explain:

```text
Insured Value
Amount covered if the shipment is lost or damaged.
```

Validate before continuing.

---

# 30. Pricing Summary

The wizard has a live summary panel.

Preserve this concept.

The summary should progressively answer:

```text
From
To

Pieces
Weight
Shipment type

Carrier/service

Delivery estimate

Shipment price
Optional services

Estimated total
```

Do not show fake/default information as confirmed information.

Use:

```text
Not selected
Pending
Calculated after package details
```

when data does not yet exist.

---

# 31. Summary Panel Hierarchy

Keep the panel concise.

Do not turn it into another form.

Primary hierarchy:

```text
Route

Shipment facts

Selected service

Price

Primary action
```

Secondary internal information belongs elsewhere.

---

# 32. Staff Pricing

Authorized staff may see:

```text
Carrier base rate
Markup
Sale price
Pricing policy source
```

Clients should see only the price information appropriate for them.

Do not accidentally expose margin or internal pricing information.

---

# 33. Step 4 — Review

The review page must answer:

> Is everything correct before we create this shipment?

Group information by:

```text
Route
Shipment
Packages
Customs
Service
Options
Price
```

Provide section-level Edit actions.

Example:

```text
From & To                       Edit

Kuwait
→
Saudi Arabia
```

Do not force the user to repeatedly click Back through the wizard to correct one small mistake.

---

# 34. Final Action Copy

The final CTA must describe the actual action.

Evaluate terms such as:

```text
Authorize & Dispatch
```

against actual backend behavior.

If the action merely creates/books a shipment, prefer accurate copy such as:

```text
Create Shipment
Book Shipment
Confirm Shipment
```

If it genuinely authorizes and dispatches to the carrier, the existing terminology may be correct.

Never use dramatic copy that overstates what the action does.

---

# 35. Navigation Semantics

Every navigation control must do what its label says.

Examples:

```text
Back
Continue
Save Draft
Discard Draft
Cancel
Create Shipment
```

Never connect a button labelled:

```text
Discard Draft
```

to simple previous-step navigation.

Audit every wizard action for semantic correctness.

---

# 36. Draft Handling

Determine whether the current wizard genuinely supports drafts.

If not:

Do not imply persistent drafts in UI labels such as:

```text
DRAFT
Discard Draft
Save Draft
```

unless that behavior really exists.

If draft persistence is added later:

Define:

```text
Autosave
Resume
Discard
Save status
```

properly.

---

# 37. Validation

Validation should be:

```text
Field-specific
Step-specific
Human-readable
Actionable
Carrier-aware
```

Avoid:

```text
Required
```

alone whenever context would help.

Prefer:

```text
Enter the consignee phone number.
```

or:

```text
A postal code is required for DHL shipments to this destination.
```

where the application knows the reason.

---

# 38. Carrier-Aware Validation

The project already contains carrier profiles.

The UX should reflect them.

Example:

```text
DHL requires:
postal code

OTE may not.
```

Do not show every field as universally required.

Visually indicate carrier-specific requirements only when relevant.

---

# 39. Validation Timing

Validate:

```text
Formatting → during/after entry

Required fields → before continuing

Cross-field/business logic → before relevant API calls

Submission → final backend validation
```

Avoid aggressive errors while the user is still typing.

---

# 40. API Errors

Never expose raw backend errors when a meaningful user-facing explanation can be derived.

Bad:

```text
400
Adapter validation failed
```

Better:

```text
DHL requires a postal code for the destination address.
```

Preserve raw error information for diagnostics where appropriate, not as primary UX.

---

# 41. Rate Errors

Differentiate:

```text
No service available

Missing information

Carrier unavailable

Temporary carrier error

Manual pricing required

Network/API failure
```

These require different user actions.

Do not collapse them all into:

```text
Rating error.
```

---

# 42. Mobile UX

The shipment wizard must work well on phones.

Specifically audit:

```text
320px
375px
390px
430px
```

Check:

```text
Step navigation
Address entry
Parcel cards
Customs item forms
Date picker
Dropdowns
Service cards
Billing
Summary
Review
Success
```

---

# 43. Mobile Summary

The desktop sticky right-hand summary cannot simply become a very long block after the form.

Consider mobile patterns such as:

```text
Compact sticky shipment summary

Expandable bottom summary

Price + Continue sticky footer
```

Do not duplicate primary actions confusingly.

---

# 44. Primary Action

At each step there should be one obvious primary action.

Example:

```text
Continue to Contents
Continue to Services
Review Shipment
Create Shipment
```

Avoid multiple competing "Continue" controls visible at the same time unless one is clearly responsive-only.

---

# 45. Desktop UX

Desktop can retain a two-column structure:

```text
Main form        Live summary
```

Recommended approximate relationship:

```text
65–70% form
30–35% summary
```

Do not make individual form fields unnecessarily wide.

---

# 46. Density

This is an operational product.

Do not oversimplify until it becomes inefficient.

Experienced staff may create many shipments.

Optimize for both:

```text
First-time clarity

Repeat-user speed
```

Use strong grouping instead of enormous whitespace.

---

# 47. Accessibility

Target WCAG 2.2 AA where practical.

Audit:

```text
Labels
Keyboard flow
Focus state
Error association
Contrast
Touch size
Stepper semantics
Expandable controls
Checkboxes
Radio/card selection
Screen reader descriptions
```

Color alone must never indicate important status.

---

# 48. Loading States

Explicitly design:

```text
Loading client data
Loading carriers
Calculating rates
Creating shipment
Updating shipment
```

Examples:

```text
Finding available services…

Creating shipment with DHL…
```

Prevent duplicate submissions.

---

# 49. Success State

After successful creation clearly show:

```text
Shipment created

Tracking number
Carrier
Service
Route
Price if appropriate
```

Provide obvious next actions:

```text
View Shipment
Print Label
Download Documents
Create Another Shipment
Track Shipment
```

Only show actions supported by actual data/functionality.

---

# 50. Edit Shipment Mode

`ShipmentWizardV2` also supports edit behavior.

Do not design only for "New Shipment".

Audit:

```text
New shipment

Edit shipment
```

Ensure users understand what can be changed after creation and what cannot.

---

# 51. Existing Components First

Before creating a component, search:

```text
frontend/src/ui
frontend/src/ui/components
frontend/src/components
frontend/src/components/shipment
```

Reuse when appropriate.

Avoid creating:

```text
NewButton
WizardButton
FancyButton
ShipmentInput2
```

when equivalent primitives already exist.

---

# 52. MUI Strategy

MUI is already a major dependency.

Use it consistently where existing wizard code uses it.

Prefer:

```text
theme.palette
theme.spacing
theme.typography
shared sx patterns
shared custom components
```

over repeated hardcoded values.

Do not migrate the entire frontend to or from MUI as part of a wizard UX task.

---

# 53. Styling Strategy

Avoid expanding the current mixture of:

```text
styled-components
MUI sx
CSS tokens
inline style
hardcoded colors
```

For modified/new wizard UI:

Prefer the project's most reusable existing pattern.

When practical:

```text
shared design tokens
→ shared components
→ theme
→ local sx
```

Use page-specific hardcoding only when genuinely necessary.

---

# 54. Copywriting Style

Use clear logistics language.

Prefer:

```text
Packages
Customs Items
Shipment Value
Pickup
Carrier
Service
Estimated Delivery
Shipment Price
Insurance
Create Shipment
```

Avoid unnecessarily elaborate terms such as:

```text
Physical Assets
Asset Registration
Editorial Description
Financial Configuration
Operational Authorization
```

unless those labels have a specific product meaning.

---

# 55. Helpful Microcopy

Microcopy should prevent errors.

Good:

```text
Package dimensions are used to calculate chargeable weight.
```

Good:

```text
HS codes are used by customs to classify goods.
```

Good:

```text
The consignee will be responsible for import duties.
```

Avoid paragraphs of documentation.

---

# 56. Don't Expose Backend Architecture

Users should not need to understand:

```text
Adapters
Carrier profile objects
Service codes
II
Policy sources
API payloads
Internal carrier mapping
LOGESTECHS → OTE normalization
```

Convert system concepts into product language.

Internal users may see technical information only where operationally useful.

---

# 57. UX Audit Method

When invoked, perform the audit in this order.

## Pass 1 — Functional Understanding

Map:

```text
Entry routes
Roles
Step state
Form state
API calls
Validation
Rate calculation
Submission
Success
Edit mode
```

---

## Pass 2 — User Journey

Map:

```text
Staff journey

Client journey

Assigned-carrier journey

Manual Shipment journey

Multiple-service journey

No-rate journey

Dangerous-goods journey

Document shipment journey

Package/customs journey
```

---

## Pass 3 — Friction

Find:

```text
Redundant inputs
Unclear terminology
Fields displayed too early
Hidden important actions
Duplicate controls
Bad defaults
Poor empty states
Confusing error handling
Weak mobile behavior
Misleading labels
Information overload
```

---

## Pass 4 — Visual Consistency

Check:

```text
Typography
Spacing
Input styling
Cards
Border radius
Colors
Buttons
Icons
Summary
Stepper
Responsive behavior
```

---

## Pass 5 — Simplification

Ask for every field:

```text
Is it required?

Can we infer it?

Can we default it?

Can we hide it until relevant?

Can we reuse saved information?

Can we explain it better?
```

---

# 58. Severity Levels

Report UX findings using:

```text
P0 — prevents shipment completion or can create incorrect shipment

P1 — major workflow confusion / significant operational friction

P2 — meaningful UX improvement

P3 — polish / visual refinement
```

Prioritize P0/P1 before visual polish.

---

# 59. Required Audit Output

Before implementation return:

```markdown
# BLUF

Main finding:
...

Recommended direction:
...

Do not change:
...


# Current Wizard

Addresses
→ Contents
→ Billing
→ Review


# Critical UX Findings

## P0

...

## P1

...

## P2

...

## P3

...


# Role Differences

Client:
...

Staff:
...

Manual Shipment:
...


# Recommended Flow

...


# Step-by-Step UX

## Step 1

...

## Step 2

...


# Mobile

...


# Visual System

...


# Business Logic To Preserve

...


# Files Likely To Change

...


# Implementation Stages

...


# Acceptance Criteria

...
```

---

# 60. Do Not Implement Immediately

Unless specifically told to implement immediately:

First provide:

```text
Audit
Recommendation
Proposed wizard structure
Affected files
Risk assessment
Implementation stages
```

Then implementation may begin.

---

# 61. Implementation Stages

Prefer small auditable stages.

Example:

```text
Stage 1
Navigation + terminology

Audit

Stage 2
Address step

Audit

Stage 3
Package/customs step

Audit

Stage 4
Rate/service UX

Audit

Stage 5
Billing/options

Audit

Stage 6
Review

Audit

Stage 7
Mobile

Audit

Stage 8
Accessibility + regression

Final audit
```

Do not redesign the entire 65KB wizard in one uncontrolled change.

---

# 62. Regression Protection

After every meaningful implementation stage run the repository's available checks.

At minimum evaluate:

```text
lint
tests
build
```

Do not declare completion while existing functionality is broken.

---

# 63. Business Regression Checklist

Verify:

- [ ] staff shipment creation
- [ ] client shipment creation
- [ ] assigned carrier
- [ ] assigned client
- [ ] carrier selection where allowed
- [ ] Manual Shipment
- [ ] document shipment
- [ ] package shipment
- [ ] multiple parcels
- [ ] customs items
- [ ] dangerous goods
- [ ] rate calculation
- [ ] multiple services
- [ ] optional services
- [ ] insurance
- [ ] declared currency
- [ ] billing currency
- [ ] markup visibility
- [ ] manual pricing
- [ ] review
- [ ] create shipment
- [ ] edit shipment
- [ ] success state

---

# 64. UX Regression Checklist

Verify:

- [ ] user always knows current step
- [ ] Back means Back
- [ ] Discard means Discard
- [ ] primary CTA is obvious
- [ ] required fields are obvious
- [ ] errors explain how to fix the issue
- [ ] rate loading is understandable
- [ ] service selection is visible
- [ ] total price is understandable
- [ ] mobile flow is usable
- [ ] keyboard navigation works
- [ ] no internal terminology leaks unnecessarily
- [ ] no duplicate competing actions
- [ ] information entered remains intact when navigating backward

---

# 65. Special Attention Areas in Current Code

During every wizard audit specifically inspect:

### Navigation labels

Verify that action labels match actual handlers.

### Draft terminology

Determine whether "Draft" represents real persistence or only temporary React state.

### Service selection

Ensure carrier services are visible and understandable.

### Rate timing

Review whether calculating rates only after the Contents step creates the best UX.

### Validation

Review the relatively minimal current step validation against actual carrier requirements.

### Billing complexity

Look for settings that should use progressive disclosure.

### Summary duplication

Check whether the desktop summary and mobile actions create duplicate or competing actions.

### Design-system fragmentation

Check whether wizard-specific styling can safely reuse existing Target tokens/components.

### Language

Look for overly technical or overly corporate phrases that can be replaced with normal logistics terminology.

---

# 66. Improvement Decision Framework

For every proposed change explain:

```text
Problem

Evidence in current flow

User impact

Recommended solution

Business logic impact

Files affected

Risk

How to test
```

Do not recommend changes merely because they look modern.

---

# 67. UX Research Heuristic

Design primarily for these scenarios:

### Fast repeat shipment

An experienced staff member knows exactly what they are entering.

Goal:

```text
speed
keyboard efficiency
defaults
saved information
minimal clicks
```

### New client shipment

User may not understand logistics terminology.

Goal:

```text
clarity
guidance
progressive disclosure
error prevention
```

The interface must serve both.

---

# 68. Future AI Opportunities

AI may eventually help with:

```text
HS code suggestions
Customs description improvement
Country-of-origin suggestions
Address normalization
Shipment validation
Missing-field detection
Dangerous-goods warnings
Service recommendations
```

But AI must:

```text
Suggest
Explain
Allow review
```

Never silently modify consequential shipment information.

This skill does NOT require adding AI features.

---

# 69. Definition of Done

A shipment wizard improvement is complete only when:

```text
The user understands what to do.

The user enters less unnecessary information.

Important carrier requirements remain enforced.

The user knows the shipment cost/status.

The user understands the final action.

Client and staff experiences remain appropriately different.

Manual Shipment remains a first-class workflow.

Mobile works properly.

Existing shipment functionality remains intact.

The visual design matches Target Logistics.

Tests/build pass.

The resulting code is easier—not harder—to maintain.
```

---

# 70. North Star

The final experience should make shipping complexity disappear behind a clear operational flow.

The user should think:

> I know exactly what information Target needs, what this shipment will cost, and what happens when I confirm it.

The system handles the complexity.

The user handles the shipment.