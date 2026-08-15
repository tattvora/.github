# Tattvalens POC — From Cloud Visibility to Action

## What is Tattvalens?

**Tattvalens helps businesses understand their cloud environment and identify what needs attention.**

Instead of looking through thousands of cloud settings manually, Tattvalens brings the information together and highlights:

- What resources exist
- Who owns them
- Whether important tags and metadata are present
- Security, cost and governance issues
- What should be fixed first
- What action can be taken

> **Turn cloud complexity into clear, actionable decisions.**

---

# POC Snapshot

The supplied offline optimization output demonstrates:

| Metric | Result |
|---|---:|
| Resources analyzed | 18 |
| Findings | 16 |
| Critical findings | 2 |
| High findings | 2 |
| Exposed resources | 2 |
| Governance findings | 10 |
| Cost findings | 2 |
| Estimated monthly savings | Not currently calculated |
| Resources with ownership identified | 0 / 18 |

These figures are from the supplied offline optimization output and are intended to demonstrate the platform's capabilities.

---

# 1. Know What You Have

Tattvalens creates a clear view of the cloud environment, including resources such as:

- EC2
- S3
- VPCs and subnets
- IAM roles
- Security groups
- Network resources

The current offline optimization output contains **18 resources** and **16 findings**.

This gives the customer a single view of what exists in the cloud environment.

---

# 2. Know Who Owns It — Ownership & Tags

Cloud resources can become difficult to manage when nobody knows which team is responsible for them.

Tattvalens can identify resources where ownership information is missing and highlight them as governance findings.

### Example

**Problem:** Resource has no Owner Team information

**Finding:** `UNATTRIBUTED_RESOURCE`

**Recommended action:**  
**Assign Owner Team tag to the resource**

This turns an unknown resource into an accountable resource.

### Tags can answer simple business questions

| Question | Example Tag |
|---|---|
| Who owns it? | `OwnerTeam = Platform` |
| Which environment? | `Environment = Production` |
| Which application? | `Application = Payments` |
| Which business area? | `BusinessUnit = Finance` |

The business benefit is simple:

> **Better tagging makes it easier to understand ownership, accountability and the purpose of cloud resources.**

---

# 3. Find Security, Cost & Governance Issues

Tattvalens can identify conditions that may require attention.

Examples from the supplied POC data include:

- Publicly exposed resources
- Unencrypted resources
- Missing S3 lifecycle policies
- Missing ownership information

### Example: Public S3 Configuration

A public S3 configuration is identified as a **critical security finding** in the supplied optimization output.

This allows the customer to focus on important issues instead of manually checking every resource.

---

# 4. Prioritize & Recommend Actions

Customers can have many cloud findings. Tattvalens helps prioritize them so teams can focus on the issues that matter most.

It connects:

**Problem → Priority → Action → Potential Value**

### Example: Missing S3 Lifecycle Policy

**Finding:** S3 bucket has no lifecycle policy

**Risk score:** 20

**Recommended action:** Configure a lifecycle policy to expire or transition old objects

**Estimated effort:** 1 hour

**Estimated savings:** Not calculated in the current POC output

**ROI:** QUICK WIN

The current output identifies two cost-related findings. Billing and utilization data would be needed to estimate financial impact.

---

# 5. From Cloud Data to Decisions

Tattvalens helps answer the questions a cloud team or business needs to act on:

| Business Question | Tattvalens Helps Answer |
|---|---|
| What do we have? | Cloud resource inventory |
| Who owns it? | Ownership and tagging |
| What needs attention? | Security, cost and governance findings |
| What matters most? | Prioritized risk |
| What should we do? | Recommended actions |
| What value could we get? | Estimated impact where data is available |

---

# 6. Business Value

## Cost

Identify opportunities to reduce unnecessary cloud spending.

## Security

Highlight potentially risky cloud configurations and exposed resources.

## Governance

Improve ownership and tagging so teams know:

- What a resource is for
- Who owns it
- Which environment it belongs to
- Which team should take action

---

# Example Customer Journey

A simple Tattvalens experience looks like this:

```text
Connect AWS
    ↓
Discover cloud resources
    ↓
Check ownership & tags
    ↓
Identify security, cost & governance issues
    ↓
Prioritize important findings
    ↓
Show recommended actions
    ↓
Customer knows what to fix
```

---

# POC Takeaway

Tattvalens is not just a cloud inventory.

It helps answer:

> **What do we have?**

> **Who owns it?**

> **What needs attention?**

> **What should we fix first?**

> **What action should we take?**

> **Where can we identify cloud cost opportunities?**

## Tattvalens

### **Understand your cloud. Assign ownership. Find what matters. Take action.**

---

## POC Data Note

The supplied resource, relationship and signal datasets come from different scan snapshots. Therefore, the POC uses them to demonstrate the individual capabilities of the platform rather than claiming that every displayed resource, relationship and signal came from one synchronized scan.

The findings, scores and recommendations shown are based on the supplied optimization outputs. Recommendations demonstrate suggested actions and should not be interpreted as completed changes to the AWS environment.

Savings estimates are recommendations based on the available data and are not confirmed financial outcomes. More accurate financial impact would require billing and utilization data.
