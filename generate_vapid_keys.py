from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

# Generate EC key pair
private_key = ec.generate_private_key(ec.SECP256R1())

# Export private key in PEM format
private_pem = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)

# Generate public key
public_key = private_key.public_key()
public_bytes = public_key.public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint
)

# VAPID requires base64-encoded public key
public_key_b64 = base64.urlsafe_b64encode(public_bytes).rstrip(b'=').decode('utf-8')

print("----- BEGIN VAPID KEYS -----")
print("VAPID_PUBLIC_KEY =", public_key_b64)
print("VAPID_PRIVATE_KEY (PEM):")
print(private_pem.decode())
