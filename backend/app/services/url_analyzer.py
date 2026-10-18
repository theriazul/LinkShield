from __future__ import annotations

from typing import Any, Dict, List
from urllib.parse import urlparse


def analyze_url(url: str) -> Dict[str, Any]:
    value = str(url or '').strip()
    if not value:
        raise ValueError('URL is required.')
    if any(ch.isspace() for ch in value):
        raise ValueError('URL cannot contain whitespace.')
    if '://' not in value:
        value = f'https://{value}'
    try:
        parsed = urlparse(value)
    except ValueError as exc:
        raise ValueError('That URL format is invalid.') from exc
    if parsed.scheme not in {'http', 'https'}:
        raise ValueError('Only HTTP and HTTPS URLs are supported.')
    if not parsed.netloc or '.' not in parsed.netloc:
        raise ValueError('Enter a complete domain name such as example.com.')

    hostname = parsed.hostname.lower() if parsed.hostname else ''
    full = f'{hostname}{parsed.path}{parsed.query}'.lower()
    findings: List[Dict[str, Any]] = []
    score = 0

    def add(title: str, detail: str, severity: str) -> None:
        findings.append({'title': title, 'detail': detail, 'severity': severity})

    if parsed.scheme == 'https':
        add('Encrypted connection format', 'The URL uses HTTPS to encrypt the connection in transit.', 'good')
    else:
        score += 18
        add('Unencrypted HTTP', 'The URL uses HTTP instead of HTTPS, which increases risk for sensitive information.', 'warn')

    if 'xn--' in hostname:
        score += 24
        add('Punycode domain detected', 'The hostname uses punycode and may be used to resemble a trusted domain.', 'warn')
    else:
        add('Domain encoding appears normal', 'The hostname did not include punycode markers.', 'good')

    if hostname.replace('.', '').isdigit():
        score += 22
        add('Direct IP address host', 'The URL points to an IP address instead of a normal hostname.', 'warn')
    else:
        add('Hostname format looks domain-like', 'The hostname is a normal domain-form style rather than a raw IP address.', 'good')

    suspicious_words = ['login', 'verify', 'verification', 'secure', 'account', 'password', 'wallet', 'recover', 'update', 'signin', 'confirm', 'payment', 'gift', 'free-prize']
    found_words = [word for word in suspicious_words if word in full]
    if found_words:
        score += min(22, len(found_words) * 6)
        add('Urgency or credential language', f"Keywords found: {', '.join(found_words[:4])}. These are common in scam and phishing lures.", 'warn')
    else:
        add('No common credential lure words', 'No obvious login or urgency keywords were found in the hostname or path.', 'good')

    shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'is.gd', 'cutt.ly', 'shorturl.at', 'rb.gy', 'ow.ly']
    if hostname in shorteners:
        score += 18
        add('URL shortener detected', 'Shortened URLs hide the final destination and should be checked carefully.', 'warn')
    else:
        add('Shortener check', 'The host does not match a commonly used URL shortener.', 'good')

    if parsed.username or parsed.password or '@' in parsed.netloc:
        score += 28
        add('Embedded credentials or @ symbol', 'User-info syntax can disguise the real destination and should be reviewed carefully.', 'bad')
    else:
        add('No embedded credentials', 'No username or password segment was detected in the URL authority.', 'good')

    if len(hostname.split('.')) >= 5:
        score += 12
        add('Long subdomain chain', 'Multiple subdomains can obscure the actual registrable domain.', 'warn')

    if len(value) > 180:
        score += 8
        add('Unusually long URL', 'Long URLs may hide tracking parameters or a hidden target.', 'warn')

    if '-' in hostname and any(term in hostname for term in ['secure', 'account', 'login', 'verify', 'support', 'bank']):
        score += 10
        add('Hyphenated sensitive-looking domain', 'A hyphenated hostname may imitate a trusted brand or service.', 'warn')

    score = min(100, max(0, score))
    level = 'high' if score >= 55 else 'caution' if score >= 25 else 'low'
    return {'url': value, 'score': score, 'level': level, 'findings': findings, 'note': 'Heuristic analysis only; this does not prove a domain is safe.'}
