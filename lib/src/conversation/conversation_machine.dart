import '../api/llm_models.dart';
import '../safety/crisis_models.dart';
import 'conversation_models.dart';

class ConversationTransition {
  const ConversationTransition({
    required this.session,
    required this.uiAction,
  });

  final ConversationSession session;
  final ConversationUiAction uiAction;
}

enum ConversationUiAction {
  showMessage,
  showVerseConsent,
  showVerse,
  showActionChoices,
  showSummary,
  showCrisisSupport,
  showEmergencySupport,
  end,
}

class ConversationMachine {
  const ConversationMachine({
    this.maxCoreTurns = 3,
    this.maxExtraTurns = 2,
  });

  final int maxCoreTurns;
  final int maxExtraTurns;

  ConversationTransition applyLocalCrisis(
    ConversationSession session,
    CrisisAssessment assessment,
    String userMessage,
  ) {
    if (!assessment.isCrisis) {
      return ConversationTransition(
        session: session.copyWith(lastUserMessage: userMessage),
        uiAction: ConversationUiAction.showMessage,
      );
    }

    return ConversationTransition(
      session: session.copyWith(
        stage: ConversationStage.crisis,
        riskLevel: assessment.level,
        lastUserMessage: userMessage,
        isEnded: true,
      ),
      uiAction: assessment.requiresImmediateUi
          ? ConversationUiAction.showEmergencySupport
          : ConversationUiAction.showCrisisSupport,
    );
  }

  ConversationTransition applyLlmResponse(
    ConversationSession session,
    LlmConversationResponse response,
  ) {
    final mergedRisk =
        response.riskLevel > session.riskLevel ? response.riskLevel : session.riskLevel;

    if (mergedRisk > 0 || response.stage == ConversationStage.crisis) {
      return ConversationTransition(
        session: session.copyWith(
          stage: ConversationStage.crisis,
          riskLevel: mergedRisk,
          turnCount: session.turnCount + 1,
          lastAssistantQuestion: response.question,
          agentMemory: response.memorySummary,
          isEnded: true,
        ),
        uiAction: mergedRisk >= 3
            ? ConversationUiAction.showEmergencySupport
            : ConversationUiAction.showCrisisSupport,
      );
    }

    final nextStage = _sanitizeStage(session, response);
    final nextTurn = session.turnCount + 1;
    final shouldEnd = response.shouldEndConversation ||
        nextStage == ConversationStage.ended ||
        nextTurn >= maxCoreTurns + maxExtraTurns;

    return ConversationTransition(
      session: session.copyWith(
        stage: shouldEnd ? ConversationStage.ended : nextStage,
        turnCount: nextTurn,
        lastAssistantQuestion: response.question,
        agentMemory: response.memorySummary,
        isEnded: shouldEnd,
      ),
      uiAction: shouldEnd
          ? ConversationUiAction.end
          : _uiActionFor(nextStage, nextStage == ConversationStage.verseOffer),
    );
  }

  ConversationTransition acceptVerse(
    ConversationSession session, {
    required String verseId,
  }) {
    return ConversationTransition(
      session: session.copyWith(
        stage: ConversationStage.verseReflection,
        verseAccepted: true,
        selectedVerseId: verseId,
      ),
      uiAction: ConversationUiAction.showVerse,
    );
  }

  ConversationTransition declineVerse(ConversationSession session) {
    return ConversationTransition(
      session: session.copyWith(
        stage: ConversationStage.action,
        verseAccepted: false,
      ),
      uiAction: ConversationUiAction.showActionChoices,
    );
  }

  ConversationTransition selectAction(ConversationSession session) {
    return ConversationTransition(
      session: session.copyWith(stage: ConversationStage.summary),
      uiAction: ConversationUiAction.showSummary,
    );
  }

  ConversationStage _sanitizeStage(
    ConversationSession session,
    LlmConversationResponse response,
  ) {
    // Advance after three completed user/assistant exchanges.
    if (session.turnCount + 1 >= maxCoreTurns &&
        session.selectedVerseId == null &&
        session.verseAccepted == null &&
        !session.isEnded) {
      return ConversationStage.verseOffer;
    }
    if (response.shouldOfferVerse && session.turnCount >= 2) {
      return ConversationStage.verseOffer;
    }

    // Prevent the model from jumping to a verse too early.
    if (response.stage == ConversationStage.verseOffer &&
        session.turnCount < 2) {
      return ConversationStage.need;
    }

    return response.stage;
  }

  ConversationUiAction _uiActionFor(
    ConversationStage stage,
    bool shouldOfferVerse,
  ) {
    if (shouldOfferVerse || stage == ConversationStage.verseOffer) {
      return ConversationUiAction.showVerseConsent;
    }
    return switch (stage) {
      ConversationStage.verseReflection => ConversationUiAction.showVerse,
      ConversationStage.action => ConversationUiAction.showActionChoices,
      ConversationStage.summary => ConversationUiAction.showSummary,
      ConversationStage.crisis => ConversationUiAction.showCrisisSupport,
      ConversationStage.ended => ConversationUiAction.end,
      _ => ConversationUiAction.showMessage,
    };
  }
}
