export const blogInfo = {
  name: "AptlySaid Blog",
  description: "Insights and strategies for mastering online review management",
}

export type BlogPost = {
  link: string
  date: string // date is a string 'YYYY-MM-DD'
  title: string
  description: string
  parsedDate?: Date // Optional because it's added dynamically
}

// Update this list with the actual blog post list
// Create a page in the "(posts)" directory for each entry
const blogPosts: BlogPost[] = [
  {
    title: "5 Ways AI is Revolutionizing Review Management",
    description:
      "Discover how artificial intelligence is transforming the way businesses handle customer feedback and online reviews.",
    link: "/blog/ai_revolutionizing_review_management",
    date: "2024-03-10",
  },
  {
    title: "The True Cost of Ignoring Customer Reviews",
    description:
      "Learn why neglecting online reviews can cost your business thousands in lost revenue and how to avoid common pitfalls.",
    link: "/blog/cost_of_ignoring_reviews",
    date: "2024-02-23",
  },
  {
    title: "Building Trust at Scale: A Guide to Review Response",
    description:
      "Best practices for crafting personalized, effective responses to customer reviews that build trust and drive sales.",
    link: "/blog/building_trust_review_response",
    date: "2024-01-13",
  },
]

// Parse post dates from strings to Date objects
for (const post of blogPosts) {
  if (!post.parsedDate) {
    const dateParts = post.date.split("-")
    post.parsedDate = new Date(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
    ) // Note: months are 0-based
  }
}

export const sortedBlogPosts = blogPosts.sort(
  (a: BlogPost, b: BlogPost) =>
    (b.parsedDate?.getTime() ?? 0) - (a.parsedDate?.getTime() ?? 0),
)
