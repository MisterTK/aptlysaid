import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ url, fetch, request }) => {
  const path = url.pathname.replace("/account/api/", "/api/v1/")
  const newUrl = new URL(path, url.origin)
  newUrl.search = url.search

  const headers = new Headers(request.headers)
  headers.set("cookie", request.headers.get("cookie") || "")

  return fetch(newUrl.toString(), {
    method: "GET",
    headers: headers,
  })
}

export const POST: RequestHandler = async ({ url, fetch, request }) => {
  const path = url.pathname.replace("/account/api/", "/api/v1/")
  const newUrl = new URL(path, url.origin)
  newUrl.search = url.search

  const clonedRequest = request.clone()

  const headers = new Headers(request.headers)
  headers.set("cookie", request.headers.get("cookie") || "")
  headers.set(
    "content-type",
    request.headers.get("content-type") || "application/json",
  )

  return fetch(newUrl.toString(), {
    method: "POST",
    headers: headers,
    body: clonedRequest.body,
    duplex: "half",
  })
}

export const PUT: RequestHandler = async ({ url, fetch, request }) => {
  const path = url.pathname.replace("/account/api/", "/api/v1/")
  const newUrl = new URL(path, url.origin)
  newUrl.search = url.search

  const clonedRequest = request.clone()

  const headers = new Headers(request.headers)
  headers.set("cookie", request.headers.get("cookie") || "")
  headers.set(
    "content-type",
    request.headers.get("content-type") || "application/json",
  )

  return fetch(newUrl.toString(), {
    method: "PUT",
    headers: headers,
    body: clonedRequest.body,
    duplex: "half",
  })
}

export const PATCH: RequestHandler = async ({ url, fetch, request }) => {
  const path = url.pathname.replace("/account/api/", "/api/v1/")
  const newUrl = new URL(path, url.origin)
  newUrl.search = url.search

  const clonedRequest = request.clone()

  const headers = new Headers(request.headers)
  headers.set("cookie", request.headers.get("cookie") || "")
  headers.set(
    "content-type",
    request.headers.get("content-type") || "application/json",
  )

  return fetch(newUrl.toString(), {
    method: "PATCH",
    headers: headers,
    body: clonedRequest.body,
    duplex: "half",
  })
}

export const DELETE: RequestHandler = async ({ url, fetch, request }) => {
  const path = url.pathname.replace("/account/api/", "/api/v1/")
  const newUrl = new URL(path, url.origin)
  newUrl.search = url.search

  const headers = new Headers(request.headers)
  headers.set("cookie", request.headers.get("cookie") || "")

  return fetch(newUrl.toString(), {
    method: "DELETE",
    headers: headers,
  })
}
