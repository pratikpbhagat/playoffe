# ── CloudFront CDN for social-graphics Supabase Storage bucket ────────────────
# Puts a CDN in front of the Supabase public storage URL so Instagram/Facebook
# can fetch graphic images faster and we get caching + compression for free.

locals {
  # Extract hostname from the full storage URL
  # e.g. "https://abc.supabase.co/storage/v1/object/public/social-graphics"
  #   → origin: "abc.supabase.co"
  #   → path:   "/storage/v1/object/public/social-graphics"
  storage_domain = regex("https://([^/]+)", var.supabase_storage_url)[0]
  storage_path   = replace(var.supabase_storage_url, "https://${local.storage_domain}", "")
}

resource "aws_cloudfront_distribution" "social_graphics" {
  comment         = "${var.name_prefix} — social graphics CDN"
  enabled         = true
  is_ipv6_enabled = true
  price_class     = "PriceClass_100" # US + Europe + Asia — cheapest tier

  origin {
    domain_name = local.storage_domain
    origin_id   = "supabase-storage"
    origin_path = ""

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "supabase-storage"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400   # 1 day
    max_ttl     = 604800  # 7 days
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
