import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  useTheme,
  IconButton,
  MobileStepper,
} from "@mui/material";
import {
  AutoAwesome as AutoAwesomeIcon,
  FolderSpecial as FolderSpecialIcon,
  RecordVoiceOver as RecordVoiceOverIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  KeyboardArrowRight,
  KeyboardArrowLeft,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store/store";
import { setUserDb } from "../../store/slices/auth/authSlice";
import { useCompleteHomeTourMutation, useGetCurrentUserQuery } from "../../store/apis/authApi";

const steps = [
  {
    title: "Welcome to Plan AI",
    description:
      "Plan AI is your intelligent workspace. Instead of jumping between disconnected apps, you simply chat. The AI automatically handles your tasks, generates documents, and keeps your entire workflow synchronized.",
    icon: (color: string) => <AutoAwesomeIcon sx={{ fontSize: 100, color, mb: 4 }} />,
  },
  {
    title: "The Power of Contexts",
    description:
      "Contexts are the secret weapon of Plan AI. Think of them as dedicated brains for your projects. You can feed them with PDFs, text documents, meeting transcripts, or even connect entire GitHub repositories. This gives the AI laser-focused knowledge on your specific subject.",
    icon: (color: string) => <FolderSpecialIcon sx={{ fontSize: 100, color, mb: 4 }} />,
  },
  {
    title: "Voice & Multimodal Workflows",
    description:
      "Plan AI goes far beyond text. Using our mobile or desktop companion apps, you can record live meetings. The AI will instantly transcribe the conversation, analyze the context, and automatically extract actionable tasks into your workflow.",
    icon: (color: string) => <RecordVoiceOverIcon sx={{ fontSize: 100, color, mb: 4 }} />,
  },
  {
    title: "You're Ready to Go",
    description:
      "Your setup is complete. Try clicking one of the quick suggestions on your dashboard, or simply type a prompt below to kick off your very first workflow.",
    icon: (color: string) => <CheckCircleOutlineIcon sx={{ fontSize: 100, color, mb: 4 }} />,
  },
];

const HomeTour: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const userDb = useSelector((state: RootState) => state.auth.userDb);
  const [completeHomeTour] = useCompleteHomeTourMutation();
  const [open, setOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const maxSteps = steps.length;

  const { isFetching } = useGetCurrentUserQuery(undefined, { skip: true });

  useEffect(() => {
    // Do not trigger modal if we are currently fetching fresh user data from the server
    if (isFetching) return;

    if (userDb?.hasCompletedHomeTour === false) {
      const timer = setTimeout(() => {
        setOpen(true);
      }, 500);
      return () => {
        clearTimeout(timer);
      };
    } else if (userDb?.hasCompletedHomeTour === true) {
      setOpen(false);
    }
  }, [userDb]);

  const handleFinish = async () => {
    setOpen(false);
    try {
      const response = await completeHomeTour().unwrap();
      if (response.data) {
        dispatch(
          setUserDb({
            id: response.data.id,
            name: response.data.name || "",
            email: response.data.email,
            avatar: response.data.avatarUrl,
            role: response.data.role,
            company: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            hasCompletedOnboarding: response.data.hasCompletedOnboarding,
            hasCompletedHomeTour: response.data.hasCompletedHomeTour,
          }),
        );
      } else if (userDb) {
        dispatch(setUserDb({ ...userDb, hasCompletedHomeTour: true }));
      }
    } catch (e) {
      console.error("Failed to complete tour", e);
    }
  };

  const handleNext = () => {
    if (activeStep === maxSteps - 1) {
      handleFinish();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  return (
    <Dialog
      open={open}
      onClose={handleFinish}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          overflow: "hidden",
          minHeight: "450px",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Box sx={{ position: "absolute", right: 8, top: 8, zIndex: 10 }}>
        <IconButton onClick={handleFinish} sx={{ color: "text.secondary" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          p: 6,
          flex: 1,
        }}
      >
        {steps[activeStep].icon(theme.palette.primary.main)}
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>
          {steps[activeStep].title}
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ fontSize: "1.1rem", lineHeight: 1.6 }}
        >
          {steps[activeStep].description}
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 0, flexDirection: "column", alignItems: "stretch" }}>
        <Box
          sx={{
            px: 4,
            py: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Button
            size="large"
            onClick={handleBack}
            disabled={activeStep === 0}
            startIcon={<KeyboardArrowLeft />}
            sx={{ visibility: activeStep === 0 ? "hidden" : "visible" }}
          >
            Back
          </Button>

          <MobileStepper
            steps={maxSteps}
            position="static"
            activeStep={activeStep}
            sx={{ background: "transparent", p: 0, "& .MuiMobileStepper-dot": { mx: 1 } }}
            nextButton={null}
            backButton={null}
          />

          <Button
            size="large"
            variant="contained"
            onClick={handleNext}
            endIcon={activeStep === maxSteps - 1 ? null : <KeyboardArrowRight />}
            sx={{ borderRadius: 2, px: 3 }}
          >
            {activeStep === maxSteps - 1 ? "Get Started" : "Next"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default HomeTour;
