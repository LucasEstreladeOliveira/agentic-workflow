# Dataflow (as built): <Feature name>

- **Branch:** `feat/<slug>` @ `<sha>` · **Base:** `main`
- **Design:** [technical-design.md](./technical-design.md)
- Legend: 🟩 new · 🟨 changed · ⬜ read-only / affected (existing code that consumes changed data)

## 1. Overview
```mermaid
flowchart LR
  classDef new fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f
  classDef affected fill:#f3f4f6,stroke:#9ca3af,color:#374151,stroke-dasharray:4 3

  subgraph UI
    C1["OrderDetails<br/><small>features/orders/components/OrderDetails.tsx</small>"]:::changed
  end
  subgraph Client["Client state & cache"]
    Q1["useOrder → orderKeys.detail(id)"]:::new
    M1["usePayOrder"]:::new
  end
  subgraph API
    E1["GET /orders/:id"]:::changed
    E2["POST /orders/:id/pay"]:::new
  end
  subgraph Server
    S1["orderService.pay()<br/>validate · authorize"]:::new
  end
  subgraph DB
    T1[("Order<br/>+ paidAt")]:::changed
  end
  subgraph External
    X1["Stripe PaymentIntent"]:::affected
  end

  C1 -- read --> Q1 -- "getOrder()" --> E1 -- "prisma.order.findUnique" --> T1
  C1 -- "pay.mutate(id)" --> M1 -- "payOrder()" --> E2 --> S1 -- "prisma.order.update" --> T1
  S1 -- "confirm" --> X1
  M1 -. "setQueryData detail · invalidate lists()" .-> Q1
```

## 2. Write flows
### <Flow name>
```mermaid
sequenceDiagram
  actor U as User
  participant C as OrderDetails
  participant M as usePayOrder
  participant A as POST /orders/:id/pay
  participant S as orderService
  participant D as DB
  U->>C: click Pay
  C->>M: mutate(id)
  M->>A: payOrder(id)
  A->>S: pay(id, user)
  alt not owner
    S-->>A: 403
    A-->>M: ApiError(403)
    M-->>C: error → Alert
  else ok
    S->>D: update Order set paidAt
    D-->>S: order
    S-->>A: 200 order
    A-->>M: Order
    M->>M: setQueryData(detail) · invalidate(lists)
    M-->>C: success → toast
  end
```

## 3. Data model (added / changed only)
```mermaid
erDiagram
  ORDER {
    string id PK
    datetime paidAt "NEW, nullable"
  }
```

## 4. Data dictionary
| Model.field | Type | Null / default | Written by | Read by | PII |
|---|---|---|---|---|---|
| `Order.paidAt` | `DateTime` | nullable | `orderService.pay` | `GET /orders/:id`, `OrderDetails`, `reports/revenue.ts` ⬜ | no |

## 5. Cache map
| Query key | Filled by | Invalidated / updated by | staleTime |
|---|---|---|---|
| `orderKeys.detail(id)` | `GET /orders/:id` | `usePayOrder` (setQueryData) | 30s |
| `orderKeys.lists()` | `GET /orders` | `usePayOrder` (invalidate) | default |

## 6. Drift from design
| Design said | Built | Why |
|---|---|---|
| | | |

## 7. Not in the plan's impact map
-
