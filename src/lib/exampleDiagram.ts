export const exampleDiagram = `flowchart LR
  subgraph apps [Applications]
    web[apps/web]
    admin[apps/admin]
    mobile[apps/mobile]
  end

  subgraph platform [Platform libraries]
    shell[libs/shell]
    auth[libs/auth]
    data[(libs/data-access)]
  end

  subgraph design [Design system]
    ui[libs/ui]
    tokens[libs/tokens]
  end

  web -->|imports| shell
  web --> ui
  admin --> shell
  admin --> auth
  mobile --> auth
  shell --> data
  shell --> ui
  auth --> data
  ui --> tokens
`
