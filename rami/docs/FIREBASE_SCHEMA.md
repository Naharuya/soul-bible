# RAMI Firebase schema (MVP)

- parents/{parentId}
  - displayName
  - createdAt
- parents/{parentId}/children/{childId}
  - nickname
  - avatarUrl
  - createdAt
- cards/{cardId}
  - type: animal|vehicle|food|family|emotion|nature|story|music|language|custom
  - title
  - emoji
  - active
  - contentId
- contents/{contentId}
  - introText
  - imageUrl
  - audioUrl
  - videoUrl
  - choicePool[]
- parents/{parentId}/children/{childId}/interactions/{interactionId}
  - cardId
  - choiceId
  - createdAt
- parents/{parentId}/children/{childId}/creations/{creationId}
  - cardId
  - type: audio|photo|video|drawing
  - storagePath
  - createdAt

Privacy rule: never store child personal data on the NFC tag. The tag carries only a random card identifier / URL token.
