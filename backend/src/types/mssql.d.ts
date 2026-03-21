declare module 'mssql' {
  export interface config {
    server: string
    port?: number
    database: string
    authentication?: {
      type: string
      options: {
        userName: string
        password: string
      }
    }
    options?: any
  }

  export interface ConnectionPool {
    connect(): Promise<void>
    close(): Promise<void>
    connected: boolean
    request(): any
  }

  export class ConnectionPool {
    constructor(config: config)
    connect(): Promise<void>
    close(): Promise<void>
    request(): any
    connected: boolean
  }

  export const ConnectionPool: any
}
